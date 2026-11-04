/**
 * Choice statistics ("x % of players chose this").
 *
 * There is no backend yet, so the only implementation is NullChoiceStats which
 * returns null — and the UI shows nothing when it gets null. NEVER show
 * invented numbers. When a backend exists, implement ChoiceStatsProvider
 * (e.g. a fetch to your API) and pass it to createApp() in main.ts.
 */
export interface ChoiceStatsProvider {
  /** Called after a player picks a choice. */
  record(situationId: string, choiceIndex: number): void;
  /** Share (0..1) per choice, or null when no real data is available. */
  shares(situationId: string): Promise<number[] | null>;
}

export class NullChoiceStats implements ChoiceStatsProvider {
  record(): void {
    /* no backend: nothing recorded, nothing sent */
  }
  async shares(): Promise<number[] | null> {
    return null;
  }
}
