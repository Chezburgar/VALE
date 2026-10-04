import type { GameModule } from '../types';
import { Game } from './game';
import './styles.css';

// Deadshot.io — Vale Edition. Entry point loaded on demand by the Vale runner.
const module: GameModule = {
  async launch(container, ctx) {
    const game = new Game(container, ctx);
    return {
      dispose: () => game.dispose(),
      setOverlayOpen: (open) => game.setOverlayOpen(open),
      onSettingsChanged: (s) => game.onSettingsChanged(s),
    };
  },
};

export default module;
