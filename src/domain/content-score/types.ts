// تایپ‌های «امتیاز شناسنامهٔ آیتم» — 1.25.48 m6
// امتیاز هر آیتم (میزان ارجاع و استفاده) را خودِ سامانهٔ کلاینت تولید و مادی می‌کند؛
// کنترل‌پلین هنگام جمع‌آوری فقط-خواندنی همان را می‌خواند و با برچسب منبع در شناسنامه می‌گذارد.

export interface ScoreReportRow {
  source_table: string;
  source_id: string;
  refs: number;
  uses: number;
  score: number;
  formula_version: number;
  generated_at: string;
  updated_at: string;
}

/** شناسنامهٔ امتیاز — شکلی که در شناسنامهٔ CP و قرارداد سینک می‌رود */
export interface ItemScore {
  score: number;
  refs: number;
  uses: number;
  refScore: number;
  useScore: number;
  formulaVersion: number;
  generatedAt: string;
  /** منبع تولید — همیشه 'client' از سمت این سامانه */
  source: 'client';
}

export interface ScoreRefreshResult {
  exercises: number;
  templates: number;
  durationMs: number;
}
