import type { ComponentType } from 'react'
import type { DrillProps } from './common'
import { BassClash, EqDetective, FilterSweep, FxSpotter, GainMatch, GenreId, LoopLab, SyncCheck, TimeFeel } from './ear'
import { GearLab, GearLearn } from './gear'
import { BpmLearn, CamelotLearn, SetLearn, SignalLearn } from './learn'
import { BpmMath, Camelot, SetBuilder, SignalFlow, Vocab, VocabLearn } from './quiz'
import { DownbeatTapper, DropTiming, PhraseIn, TapTempo, TempoMatch } from './timing'

export const DRILL_COMPONENTS: Record<string, ComponentType<DrillProps>> = {
  timefeel: TimeFeel,
  downbeat: DownbeatTapper,
  bpmmath: BpmMath,
  sync: SyncCheck,
  tempomatch: TempoMatch,
  taptempo: TapTempo,
  drop: DropTiming,
  phrase: PhraseIn,
  eq: EqDetective,
  filter: FilterSweep,
  gain: GainMatch,
  clash: BassClash,
  loops: LoopLab,
  fx: FxSpotter,
  genre: GenreId,
  camelot: Camelot,
  setbuilder: SetBuilder,
  vocab: Vocab,
  signal: SignalFlow,
  gear: GearLab,
}

/** The Learn step of each knowledge drill, shown before its quiz. */
export const LEARN_COMPONENTS: Record<string, ComponentType<{ onQuiz: () => void }>> = {
  bpmmath: BpmLearn,
  camelot: CamelotLearn,
  signal: SignalLearn,
  setbuilder: SetLearn,
  vocab: VocabLearn,
  gear: GearLearn,
}
