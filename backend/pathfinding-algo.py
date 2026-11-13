
import math
import heapq

# Replace these bounds with the coordinates from VKS_MAX_BOUNDS
VKS_MAX_BOUNDS = [
    [0.0, 0.0],  # Southwest: minimum latitude, longitude
    [1.0, 1.0],  # Northeast: maximum latitude, longitude
]

GRID_MIN_LAT = VKS_MAX_BOUNDS[0][0]
GRID_MAX_LAT = VKS_MAX_BOUNDS[1][0]
GRID_MIN_LON = VKS_MAX_BOUNDS[0][1]
GRID_MAX_LON = VKS_MAX_BOUNDS[1][1]

GRID_CELLS_X = 110
GRID_CELLS_Y = 90

DIRECTIONS = [
    (-1, -1), (-1, 0), (-1, 1),
    (0, -1),           (0, 1),
    (1, -1),  (1, 0),  (1, 1),
]


def to_cell(lat, lon):
    """Convert geographic coordinates into grid cells."""
    x = min(
        GRID_CELLS_X - 1,
        max(0, math.floor(
            ((lon - GRID_MIN_LON) / (GRID_MAX_LON - GRID_MIN_LON))
            * (GRID_CELLS_X - 1) + 0.5
        ))
    )

    y = min(
        GRID_CELLS_Y - 1,
        max(0, math.floor(
            ((lat - GRID_MIN_LAT) / (GRID_MAX_LAT - GRID_MIN_LAT))
            * (GRID_CELLS_Y - 1) + 0.5
        ))
    )

    return (x, y)


def to_coord(x, y):
    """Convert grid cells back into geographic coordinates."""
    lat = GRID_MIN_LAT + (
        y / (GRID_CELLS_Y - 1)
    ) * (GRID_MAX_LAT - GRID_MIN_LAT)

    lon = GRID_MIN_LON + (
        x / (GRID_CELLS_X - 1)
    ) * (GRID_MAX_LON - GRID_MIN_LON)

    return (lat, lon)


def haversine_distance_km(a, b):
    """Calculate straight-line distance between two coordinates."""
    lat1, lon1 = a
    lat2, lon2 = b

    earth_radius_km = 6371

    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)

    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)

    sin_d_lat = math.sin(d_lat / 2)
    sin_d_lon = math.sin(d_lon / 2)

    a_value = (
        sin_d_lat ** 2
        + math.cos(lat1_rad)
        * math.cos(lat2_rad)
        * sin_d_lon ** 2
    )

    c = 2 * math.atan2(
        math.sqrt(a_value),
        math.sqrt(max(0, 1 - a_value))
    )

    return earth_radius_km * c


def heuristic_cost(a, b):
    """Estimate remaining distance to the destination."""
    return haversine_distance_km(a, b)


def build_astar_route(start, goal, blocked_roads=None):
    """
    Find the shortest grid route using the A* algorithm.

    start: (latitude, longitude)
    goal: (latitude, longitude)
    blocked_roads: list of (latitude, longitude)
    """
    if blocked_roads is None:
        blocked_roads = []

    start_cell = to_cell(*start)
    goal_cell = to_cell(*goal)

    blocked_cells = set()

    # Mark blocked roads and their surrounding cells
    for lat, lon in blocked_roads:
        cell_x, cell_y = to_cell(lat, lon)

        for dy in range(-1, 2):
            for dx in range(-1, 2):
                x = cell_x + dx
                y = cell_y + dy

                if (
                    0 <= x < GRID_CELLS_X
                    and 0 <= y < GRID_CELLS_Y
                ):
                    blocked_cells.add((x, y))

    # Allow the starting position
    blocked_cells.discard(start_cell)

    # Reject a blocked destination
    if goal_cell in blocked_cells and goal_cell != start_cell:
        return []

    if start_cell == goal_cell:
        return [start, goal]

    # A* data structures
    open_set = {start_cell}
    came_from = {}

    g_score = {start_cell: 0}

    f_score = {
        start_cell: heuristic_cost(start, goal)
    }

    # Priority queue: (f-cost, cell)
    open_queue = []
    heapq.heappush(
        open_queue,
        (f_score[start_cell], start_cell)
    )

    while open_queue:
        current_score, current = heapq.heappop(open_queue)

        # Ignore outdated entries
        if (
            current not in open_set
            or current_score > f_score.get(current, math.inf)
        ):
            continue

        # Destination reached
        if current == goal_cell:
            path = []
            cursor = current

            while cursor is not None:
                path.append(to_coord(*cursor))
                cursor = came_from.get(cursor)

            path.reverse()

            # Preserve exact start and goal coordinates
            full_path = [start] + path + [goal]

            # Remove consecutive duplicate coordinates
            result = []

            for point in full_path:
                if not result or point != result[-1]:
                    result.append(point)

            return result

        open_set.remove(current)

        current_x, current_y = current
        current_coord = to_coord(current_x, current_y)

        # Explore all eight neighboring cells
        for dx, dy in DIRECTIONS:
            next_x = current_x + dx
            next_y = current_y + dy

            if not (
                0 <= next_x < GRID_CELLS_X
                and 0 <= next_y < GRID_CELLS_Y
            ):
                continue

            neighbor = (next_x, next_y)

            if neighbor in blocked_cells:
                continue

            # Prevent diagonal movement through blocked corners
            if dx != 0 and dy != 0:
                adjacent_x = (current_x + dx, current_y)
                adjacent_y = (current_x, current_y + dy)

                if (
                    adjacent_x in blocked_cells
                    or adjacent_y in blocked_cells
                ):
                    continue

            neighbor_coord = to_coord(next_x, next_y)

            step_cost = haversine_distance_km(
                current_coord,
                neighbor_coord
            )

            tentative_g_score = (
                g_score.get(current, math.inf) + step_cost
            )

            if tentative_g_score < g_score.get(
                neighbor, math.inf
            ):
                # Update the shortest known path
                came_from[neighbor] = current

                g_score[neighbor] = tentative_g_score

                f_score[neighbor] = (
                    tentative_g_score
                    + heuristic_cost(neighbor_coord, goal)
                )

                open_set.add(neighbor)

                heapq.heappush(
                    open_queue,
                    (f_score[neighbor], neighbor)
                )

    # No route found
    return []


# Example usage
if __name__ == "__main__":
    start = (0.20, 0.20)
    goal = (0.80, 0.80)

    blocked_roads = [
        (0.40, 0.40),
        (0.45, 0.45),
        (0.50, 0.50),
    ]

    route = build_astar_route(
        start,
        goal,
        blocked_roads
    )

    if route:
        print("Route found!")
        print("Number of route points:", len(route))

        for point in route:
            print(point)
    else:
        print("No available route found.")
