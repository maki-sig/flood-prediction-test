export default function Footer() {
  return (
    <footer className="w-full border-t border-border-surface bg-bg-crust mt-auto py-5 px-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 sm:gap-0 text-[10px] font-mono text-text-muted uppercase tracking-widest z-20">
      <div className="flex flex-col gap-1">
        <span>© 2026 FloodVisor.</span>
        <span>
          Made with ❤️ by Sudo.MACT ( Botis, M., Bagasina, T., Danila, A., Padrinao, C.
          )
        </span>
      </div>
      <div className="flex items-center gap-3">
        <span>
          APIs powered by {" "}
          <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer" className="text-primary-blue hover:underline">OPEN-METEO</a>
          {" "}and{" "}
          <a href="https://render.com/" target="_blank" rel="noopener noreferrer" className="text-primary-blue hover:underline">RENDER</a>
        </span>
      </div>
    </footer>
  );
}
