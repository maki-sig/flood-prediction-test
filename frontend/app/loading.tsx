export default function Loading() {
  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#11111b] text-white flows-root">
      {/* Dynamic glow decorations */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#cba6f7]/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#89b4fa]/10 rounded-full blur-[120px] pointer-events-none" />
      
      <div className="relative flex flex-col items-center gap-6 z-10">
        {/* Pulsing Core */}
        <div className="relative flex items-center justify-center">
          <div className="absolute w-24 h-24 border border-primary-blue/30 rounded-full animate-ping" style={{ animationDuration: '3s' }} />
          <div className="absolute w-16 h-16 border border-[#cba6f7]/40 rounded-full animate-ping" style={{ animationDuration: '2s', animationDelay: '0.5s' }} />
          <div className="w-10 h-10 border-2 border-primary-blue border-t-transparent rounded-full animate-spin" />
        </div>

        {/* Text Area */}
        <div className="flex flex-col items-center gap-2">
          <h1 className="text-sm md:text-base font-extrabold tracking-widest uppercase bg-gradient-to-r from-[#cba6f7] to-[#89b4fa] text-transparent bg-clip-text">
            FLOWS
          </h1>
          <span className="text-[10px] md:text-xs font-mono tracking-widest text-[#89b4fa]/80 uppercase animate-pulse">
            Initializing FLOWS Core Modules...
          </span>
        </div>

        {/* Loading Bar */}
        <div className="w-48 h-1 bg-border-surface/50 rounded-full overflow-hidden mt-4">
          <div className="h-full bg-gradient-to-r from-[#cba6f7] to-[#89b4fa] w-full origin-left animate-[scale-x_2s_ease-in-out_infinite]" />
        </div>
      </div>
      
      {/* Global style for keyframes if not present */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes scale-x {
          0% { transform: scaleX(0); transform-origin: left; }
          50% { transform: scaleX(1); transform-origin: left; }
          50.1% { transform: scaleX(1); transform-origin: right; }
          100% { transform: scaleX(0); transform-origin: right; }
        }
      `}} />
    </div>
  );
}
