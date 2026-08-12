declare module '@3d-dice/dice-box-threejs' {
  interface DiceBoxOptions {
    assetPath?: string;
    sounds?: boolean;
    shadows?: boolean;
    theme_surface?: string;
    theme_material?: string;
    theme_colorset?: string;
    gravity_multiplier?: number;
    light_intensity?: number;
    baseScale?: number;
    strength?: number;
  }

  export default class DiceBox {
    constructor(selector: string, options?: DiceBoxOptions);
    initialize?(): Promise<void>;
    roll(notation: string): Promise<unknown> | void;
  }
}
