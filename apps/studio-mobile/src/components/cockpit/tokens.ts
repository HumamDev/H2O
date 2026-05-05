// Cockpit Pro design tokens for the fixed-look entry surface (signed-out
// /account-identity, /onboarding). These intentionally bypass the runtime
// scheme — those screens always show the cockpit palette regardless of the
// user's appearance choice.
//
// Single source of truth lives in `@/constants/theme` (`CockpitPalette` raw
// values + `Colors.cockpit` semantic mapping). This module re-exports the
// same constants under their existing names so nothing downstream breaks.

import { CockpitPalette, Colors } from '@/constants/theme';

const cockpit = Colors.cockpit;

export const COCKPIT_BG = cockpit.background;
export const COCKPIT_BG_RAISED = cockpit.backgroundElement;
export const COCKPIT_BG_HOVER = cockpit.backgroundSelected;

export const COCKPIT_HAIR = cockpit.hairline;
export const COCKPIT_HAIR_STRONG = CockpitPalette.hairStrong;

export const COCKPIT_INK = cockpit.text;
export const COCKPIT_INK_MUTED = CockpitPalette.inkMuted;
export const COCKPIT_INK_DIM = cockpit.textSecondary;
export const COCKPIT_INK_FAINT = CockpitPalette.inkFaint;

export const COCKPIT_COBALT = CockpitPalette.cobalt;
export const COCKPIT_CYAN = cockpit.secondary;
export const COCKPIT_CYAN_SOFT = CockpitPalette.cyanSoft;

export const COCKPIT_EMBER = cockpit.accent;
export const COCKPIT_EMBER_SOFT = cockpit.accentSoft;
