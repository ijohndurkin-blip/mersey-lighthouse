import '@fontsource/fredoka/500.css';
import '@fontsource/fredoka/600.css';
import '@fontsource/fredoka/700.css';
import '@fontsource/nunito/600.css';
import '@fontsource/nunito/800.css';
import './ui/styles.css';
import { Game } from './game/game';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const game = new Game(canvas, document.getElementById('ui') as HTMLDivElement);
(window as any).__game = game;
game.boot().catch((e) => {
  console.error(e);
  const el = document.createElement('div');
  el.className = 'fatal';
  el.textContent = 'Oh no! The game could not start on this device. Please try a different browser.';
  document.body.appendChild(el);
});
