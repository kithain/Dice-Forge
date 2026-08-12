import DiceBox from '@3d-dice/dice-box-threejs';

export interface AnimatedDie { sides: number; value?: number }

interface DiceBoxInstance {
  initialize?: () => Promise<void>;
  roll: (notation: string) => Promise<unknown> | void;
}

const boxes = new WeakMap<HTMLElement, Promise<DiceBoxInstance>>();

function notationFor(specs: AnimatedDie[]): string {
  const dice: string[] = [];
  const forced: number[] = [];
  const canForce = specs.every((spec) => spec.value !== undefined);
  for (const spec of specs.slice(0, 20)) {
    if (spec.sides === 100) {
      dice.push('1d100', '1d10');
      if (canForce) {
        const value = Math.max(1, Math.min(100, spec.value ?? 1));
        forced.push(value === 100 ? 0 : Math.floor(value / 10) * 10, value % 10);
      }
    } else {
      dice.push(`1d${spec.sides}`);
      if (canForce) forced.push(Math.max(1, Math.min(spec.sides, spec.value ?? 1)));
    }
  }
  return `${dice.join('+')}${canForce ? `@${forced.join(',')}` : ''}`;
}

async function createBox(container: HTMLElement): Promise<DiceBoxInstance> {
  if (!container.id) container.id = `dice-box-${crypto.randomUUID()}`;
  const box = new DiceBox(`#${CSS.escape(container.id)}`, {
    assetPath: '/dice-box/',
    sounds: false,
    shadows: true,
    theme_surface: 'default',
    theme_material: 'glass',
    theme_colorset: 'white',
    gravity_multiplier: 400,
    light_intensity: .9,
    baseScale: 100,
    strength: 1,
  }) as unknown as DiceBoxInstance;
  if (typeof box.initialize === 'function') await box.initialize();
  return box;
}

async function fallbackAnimation(container: HTMLElement, specs: AnimatedDie[], duration: number): Promise<void> {
  container.replaceChildren(...specs.slice(0, 10).map((spec) => {
    const die = document.createElement('span');
    die.className = `fallback-die d${spec.sides}`;
    die.textContent = spec.value === undefined ? `D${spec.sides}` : String(spec.value);
    return die;
  }));
  container.classList.add('fallback-rolling');
  await new Promise((resolve) => setTimeout(resolve, duration));
  container.classList.remove('fallback-rolling', 'rolling');
  container.hidden = true;
  container.replaceChildren();
}

export async function animateDice(container: HTMLElement, specs: AnimatedDie[], duration = 1800): Promise<void> {
  if (!specs.length) return;
  const concealed = specs.some((spec) => spec.value === undefined);
  container.hidden = false;
  container.classList.add('rolling', 'physical-dice-box');
  container.classList.toggle('concealed-dice', concealed);
  try {
    let boxPromise = boxes.get(container);
    if (!boxPromise) {
      boxPromise = createBox(container);
      boxes.set(container, boxPromise);
    }
    const box = await boxPromise;
    await Promise.race([
      Promise.resolve(box.roll(notationFor(specs))),
      new Promise((resolve) => setTimeout(resolve, Math.max(duration + 1800, 3600))),
    ]);
    await new Promise((resolve) => setTimeout(resolve, 220));
    container.classList.remove('rolling', 'concealed-dice');
    container.hidden = true;
  } catch (error) {
    console.warn('Le moteur physique V1 est indisponible, animation locale de secours utilisée.', error);
    boxes.delete(container);
    container.classList.remove('concealed-dice');
    container.replaceChildren();
    await fallbackAnimation(container, specs, duration);
  }
}
