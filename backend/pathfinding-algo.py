"""Standalone Python translation of FloodVisor's ACTIVE street-routing pipeline.

Sources: frontend/lib/{road-network,route-planner,road-checker,
shelter-recommendation}.ts. This reference does not replace the live TypeScript.
The unused legacy grid fallback is intentionally outside this street-graph port.

Coordinates: (latitude, longitude); GeoJSON positions: [longitude, latitude].
Only Python's standard library is required. Run this file for synthetic examples.
Forecasts are supplied to check_roads(); this module does not run XGBoost or
connect to Supabase.
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass, field
from typing import Callable

Coordinate = tuple[float, float]
# A probability of 0.5 means 50%. At or above this value, a road is red.
# This is an adjustable operating cutoff, not a water-depth measurement.
ROAD_PROBABILITY_THRESHOLD = 0.5


# GRAPH: coordinates are road points; edges record which points connect.
@dataclass
class RoadNetwork:
    coordinates: list[Coordinate] = field(default_factory=list)
    # dict keys act as insertion-ordered sets, matching JavaScript's Set.
    edges: dict[int, dict[int, None]] = field(default_factory=dict)


# Find the closest position on a street segment to a user's pin.
def projection(point: Coordinate, a: Coordinate, b: Coordinate):
    """Project a pin onto a road segment using the live map's calculation."""
    scale = math.cos(math.radians(point[0]))
    dx = (b[1] - a[1]) * scale
    dy = b[0] - a[0]
    denominator = dx * dx + dy * dy or 1
    t = max(0, min(1, (
        (point[1] - a[1]) * scale * dx + (point[0] - a[0]) * dy
    ) / denominator))
    coordinate = (a[0] + t * dy, a[1] + t * (b[1] - a[1]))
    distance_m = math.hypot(
        (point[1] - coordinate[1]) * scale, point[0] - coordinate[0]
    ) * 111_195
    return t, coordinate, distance_m


# Add a connection in both directions, matching the current road graph.
def connect(network: RoadNetwork, a: int, b: int):
    network.edges.setdefault(a, {})[b] = None
    network.edges.setdefault(b, {})[a] = None


# ROAD GRAPH: reuse road geometry rather than drawing across building blocks.
def build_road_network(data: dict) -> RoadNetwork:
    """Build an undirected graph from existing LineString/MultiLineString roads."""
    network = RoadNetwork()
    ids = {}
    segments = []

    # Give each unique road coordinate a node ID.
    # Convert GeoJSON's (longitude, latitude) order to (latitude, longitude).
    def node(position):
        key = tuple(position[:2])
        if key not in ids:
            ids[key] = len(network.coordinates)
            network.coordinates.append((position[1], position[0]))
        return ids[key]

    for feature in data["features"]:
        geometry = feature.get("geometry") or {}
        if geometry.get("type") == "MultiLineString":
            lines = geometry["coordinates"]
        elif geometry.get("type") == "LineString":
            lines = [geometry["coordinates"]]
        else:
            lines = []
        for line in lines:
            vertices = [
                node(position) for position in line
                if math.isfinite(position[0]) and math.isfinite(position[1])
            ]
            segments.extend(
                (a, b) for a, b in zip(vertices, vertices[1:]) if a != b
            )

    # Split a segment where another street has a vertex lying on it.
    for a, b in segments:
        splits = []
        for node_id, point in enumerate(network.coordinates):
            t, _, distance_m = projection(
                point, network.coordinates[a], network.coordinates[b]
            )
            if distance_m < 0.05:
                splits.append((t, node_id))
        splits.sort(key=lambda item: item[0])
        for left, right in zip(splits, splits[1:]):
            connect(network, left[1], right[1])
    return network


# ENDPOINTS: connect the start and shelter to the closest street segments.
# Pins farther than 150 metres from a remaining road cannot be attached.
# The route begins/ends at snapped street points; building access is unverified.
def attach_road_endpoints(
    source: RoadNetwork,
    start: Coordinate,
    goal: Coordinate,
    max_access_m: float = 150,
):
    """Copy the graph and snap endpoints to segments within the access limit."""
    network = RoadNetwork(
        source.coordinates.copy(),
        {node_id: neighbors.copy() for node_id, neighbors in source.edges.items()},
    )

    def attach(point):
        best = None
        for a, neighbors in network.edges.items():
            for b in neighbors:
                if a >= b:
                    continue
                _, coordinate, distance_m = projection(
                    point, network.coordinates[a], network.coordinates[b]
                )
                if best is None or distance_m < best[3]:
                    best = (a, b, coordinate, distance_m)
        if best is None or best[3] > max_access_m:
            return None
        a, b, coordinate, _ = best
        node_id = len(network.coordinates)
        network.coordinates.append(coordinate)
        network.edges[a].pop(b, None)
        network.edges[b].pop(a, None)
        connect(network, a, node_id)
        connect(network, node_id, b)
        return node_id

    start_id = attach(start)
    goal_id = attach(goal)
    if start_id is None or goal_id is None:
        return None
    return network, start_id, goal_id


# DISTANCE: Haversine estimates geographic distance in kilometres.
# A* adds these distances along road edges to calculate the route cost.
def haversine_distance_km(a: Coordinate, b: Coordinate) -> float:
    lat1, lon1 = a
    lat2, lon2 = b
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    value = (
        math.sin(d_lat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(d_lon / 2) ** 2
    )
    return 6371 * 2 * math.atan2(math.sqrt(value), math.sqrt(1 - value))


# HEURISTIC h(n): direct distance from a node to the snapped destination.
# It estimates the remaining distance without changing the edge cost.
def heuristic_cost(a: Coordinate, b: Coordinate) -> float:
    return haversine_distance_km(a, b)


# PRIORITY QUEUE: insert a node and keep the smallest f-score at the top.
# The heap comparisons follow the existing TypeScript implementation.
def push_min(heap, item):
    """Same score-only heap comparisons as the existing TypeScript."""
    heap.append(item)
    index = len(heap) - 1
    while index > 0:
        parent = (index - 1) // 2
        if heap[parent][1] <= heap[index][1]:
            break
        heap[parent], heap[index] = heap[index], heap[parent]
        index = parent


# Remove the node with the lowest estimated total route distance.
def pop_min(heap):
    if not heap:
        return None
    minimum = heap[0]
    last = heap.pop()
    if heap:
        heap[0] = last
        index = 0
        while True:
            left, right = index * 2 + 1, index * 2 + 2
            smallest = index
            if left < len(heap) and heap[left][1] < heap[smallest][1]:
                smallest = left
            if right < len(heap) and heap[right][1] < heap[smallest][1]:
                smallest = right
            if smallest == index:
                break
            heap[index], heap[smallest] = heap[smallest], heap[index]
            index = smallest
    return minimum


# CORE A* SEARCH
# g(n) = road distance travelled from the start.
# h(n) = estimated remaining distance to the destination.
# f(n) = g(n) + h(n); explore the smallest f-score first.
def build_street_route(
    start: Coordinate, goal: Coordinate, roads: RoadNetwork
) -> list[Coordinate]:
    """A*: g = travelled road distance; h = Haversine to snapped destination."""
    # First attach both endpoints to a copy of the supplied road graph.
    attached = attach_road_endpoints(roads, start, goal)
    if attached is None:
        return []
    network, start_id, goal_id = attached
    destination = network.coordinates[goal_id]
    # open_set holds nodes waiting to be explored.
    # came_from remembers each node's predecessor for path reconstruction.
    open_set = {start_id}
    came_from = {}
    # The start has zero travelled distance; its f-score initially equals h.
    g_score = {start_id: 0.0}
    f_score = {
        start_id: heuristic_cost(network.coordinates[start_id], destination)
    }
    queue = []
    push_min(queue, (start_id, f_score[start_id]))

    # Continue until the goal is reached or there are no candidates left.
    while queue:
        current, score = pop_min(queue)
        # Ignore queue entries superseded by a better route.
        if current not in open_set or score > f_score.get(current, math.inf):
            continue
        # Goal reached: follow predecessors backward, then reverse the path.
        if current == goal_id:
            path = []
            cursor = current
            while cursor is not None:
                path.append(network.coordinates[cursor])
                cursor = came_from.get(cursor)
            return path[::-1]

        open_set.remove(current)
        # Explore only connected neighbors in the supplied road graph.
        # Red roads were removed before A* started.
        for neighbor in network.edges.get(current, {}):
            # Candidate g-score = distance so far + this road edge's length.
            tentative = g_score[current] + haversine_distance_km(
                network.coordinates[current], network.coordinates[neighbor]
            )
            # Update the predecessor and scores only if this route is shorter.
            if tentative < g_score.get(neighbor, math.inf):
                came_from[neighbor] = current
                g_score[neighbor] = tentative
                # Standard A* priority: f(n) = g(n) + h(n).
                f_score[neighbor] = tentative + heuristic_cost(
                    network.coordinates[neighbor], destination
                )
                open_set.add(neighbor)
                push_min(queue, (neighbor, f_score[neighbor]))
    return []


# ROUTING ENTRY POINT: call A* with the already filtered street graph.
# This reference implements the live map's street branch, not its grid fallback.
def build_astar_route(start, goal, blocked_roads=None, roads=None):
    """Match the live map's graph branch; closures must be filtered beforehand."""
    if roads is None:
        raise ValueError("Pass roads=network; this reference implements street routing.")
    if blocked_roads:
        return []
    return build_street_route(start, goal, roads)


# NAME MATCHING: reconcile street labels, including Hamoraon/Hamoran.
def normalize_street(name: str) -> str:
    normalized = re.sub(r"\s+(street|st\.?)$", "", name.lower().strip())
    return "hamoran" if normalized == "hamoraon" else normalized


# ROAD CHECKER: probabilities come from outside this reference.
# The live system gets them from XGBoost through its prediction API.
def check_roads(roads: dict, forecasts=None) -> dict:
    """Use already generated probabilities; never convert probability to depth."""
    probabilities = {}
    for forecast in forecasts or []:
        name = forecast.get("street_name")
        probability = forecast.get("probability")
        # Ignore invalid forecasts; missing data must not paint a road green.
        if (
            not isinstance(name, str)
            or isinstance(probability, bool)
            or not isinstance(probability, (int, float))
            or not math.isfinite(probability)
            or not 0 <= probability <= 1
        ):
            continue
        name = normalize_street(name)
        # If a street has duplicate entries, use the highest probability.
        probabilities[name] = max(probability, probabilities.get(name, 0))

    features = []
    for feature in roads["features"]:
        properties = dict(feature.get("properties") or {})
        probability = probabilities.get(normalize_street(str(properties.get("name", ""))))
        # Gray = unknown; red = probability >= 50%; green = below 50%.
        if probability is None:
            status, color = "unknown", "#9ca3af"
        elif probability >= ROAD_PROBABILITY_THRESHOLD:
            status, color = "not_passable", "#ef4444"
        else:
            status, color = "passable", "#22c55e"
        properties.update(
            flood_probability=probability,
            passability=status,
            passability_color=color,
        )
        features.append({**feature, "properties": properties})

    checked = {**roads, "features": features}
    # Remove only red streets. Gray streets stay available with an
    # unverified-status notice in the live map. A* itself is not altered.
    routable = {
        **roads,
        "features": [
            feature for feature in features
            if feature["properties"]["passability"] != "not_passable"
        ],
    }
    return {"roads": checked, "network": build_road_network(routable)}


# CAPACITY FILTER: consider shelters only while they have remaining space.
def filter_available_shelters(shelters):
    available = []
    for pin in shelters:
        shelter = pin.get("shelter") or {}
        maximum = float(shelter.get("max_capacity") or 0)
        current = float(shelter.get("curr_capacity") or 0)
        if maximum > 0 and 0 <= current < maximum:
            available.append(pin)
    return available


# RECOMMENDATION: calculate an A* route to each eligible shelter.
# The live caller requires reachability, so unreachable shelters are discarded.
def build_shelter_recommendations(
    start: Coordinate,
    shelters: list[dict],
    route_planner: Callable,
    require_reachable: bool = False,
) -> list[dict]:
    candidates = []
    for pin in filter_available_shelters(shelters):
        goal = (pin["latitude"], pin["longitude"])
        path = route_planner(start, goal)
        if require_reachable and len(path) < 2:
            continue
        # Rank reachable shelters using the length of the calculated route.
        distance_km = (
            sum(haversine_distance_km(a, b) for a, b in zip(path, path[1:]))
            if len(path) > 1 else haversine_distance_km(start, goal)
        )
        shelter = pin.get("shelter") or {}
        available_capacity = max(
            0,
            float(shelter.get("max_capacity") or 0)
            - float(shelter.get("curr_capacity") or 0),
        )
        candidates.append({
            "shelter_id": pin["shelter_id"],
            "shelter_name": shelter.get("shelter_name", "Shelter"),
            "path": path,
            "distance_km": distance_km,
            "available_capacity": available_capacity,
            "goal": goal,
            "score": distance_km,
        })
    # Shortest route wins. More remaining capacity breaks equal-distance ties.
    candidates.sort(key=lambda candidate: (
        candidate["score"], -candidate["available_capacity"]
    ))
    return candidates


# Return the highest-ranked shelter, or None if no candidate qualifies.
def select_best_shelter_recommendation(
    start, shelters, route_planner, require_reachable=False
):
    ranked = build_shelter_recommendations(
        start, shelters, route_planner, require_reachable
    )
    return ranked[0] if ranked else None


# Connect shelter selection to the existing A* search and the supplied graph.
def find_nearest_available_shelter(start, shelters, blocked_roads=None, roads=None):
    return select_best_shelter_recommendation(
        start, shelters,
        lambda route_start, goal: build_astar_route(
            route_start, goal, blocked_roads, roads
        ),
        require_reachable=True,
    )


# PRESENTATION EXAMPLES: synthetic roads and supplied probabilities.
# These examples test routing behavior; they do not run or validate XGBoost.
def run_demo():
    """Synthetic fixture: direct green road, red-road detour, and no route."""
    def feature(name, coordinates):
        return {
            "type": "Feature",
            "properties": {"name": name},
            "geometry": {"type": "LineString", "coordinates": coordinates},
        }

    roads = {"type": "FeatureCollection", "features": [
        feature("West Street", [[123.19, 13.64], [123.191, 13.64]]),
        feature("Middle Street", [[123.191, 13.64], [123.193, 13.64]]),
        feature("East Street", [[123.193, 13.64], [123.194, 13.64]]),
        feature("Bypass Street", [
            [123.191, 13.64], [123.191, 13.643],
            [123.193, 13.643], [123.193, 13.64],
        ]),
    ]}
    start, goal = (13.64, 123.19), (13.64, 123.194)
    forecasts = [
        {"street_id": i, "street_name": name, "probability": 0.1}
        for i, name in enumerate(["west", "middle", "east", "bypass"], start=1)
    ]
    direct = build_astar_route(start, goal, roads=check_roads(roads, forecasts)["network"])
    # Mark the direct middle street red: A* must find the bypass.
    forecasts[1]["probability"] = 0.9
    detour_network = check_roads(roads, forecasts)["network"]
    detour = build_astar_route(start, goal, roads=detour_network)
    # Close the bypass too: no connected route should remain.
    forecasts[3]["probability"] = 0.9
    blocked = build_astar_route(start, goal, roads=check_roads(roads, forecasts)["network"])
    # Without forecasts, streets remain gray and general routing still works.
    unknown = build_astar_route(start, goal, roads=check_roads(roads)["network"])

    shelters = [{
        "shelter_id": 1, "latitude": goal[0], "longitude": goal[1],
        "shelter": {"shelter_name": "Example Center", "max_capacity": 20, "curr_capacity": 1},
    }]
    nearest = find_nearest_available_shelter(start, shelters, roads=detour_network)
    assert direct and all(point[0] == 13.64 for point in direct)
    assert any(point[0] == 13.643 for point in detour)
    assert blocked == []
    assert unknown == direct
    assert nearest and nearest["path"] == detour
    print("Green direct route:", direct)
    print("Middle Street red; bypass route:", detour)
    print("Middle and bypass red:", blocked)
    print("Missing forecasts: original route retained.")
    print("Nearest shelter:", nearest["shelter_name"])
    print("All five example checks passed.")


if __name__ == "__main__":
    run_demo()
