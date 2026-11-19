export type TalentType = "數位遊牧" | "重返職場媽媽" | "資深自由工作者";

export type Talent = {
  name: string;
  title: string;
  years: number;
  type: TalentType | "專業人才";
  skills: string[];
  rating: number;
  reviews: number;
  from: number;
  img: string;
  city: string;
  id?: string;
  username?: string;
  slug?: string;
};

/** Homepage prototype cards. Shown only when the live directory cannot be loaded. */
export const SAMPLE_TALENTS: Talent[] = [
  { slug: "chen-siyu", name: "陳思妤", title: "品牌行銷與公關顧問", years: 12, type: "重返職場媽媽", skills: ["行銷公關", "社群策略"], rating: 4.9, reviews: 128, from: 3600, img: "asset:t1.jpg", city: "台北" },
  { slug: "lin-zheyu", name: "林哲宇", title: "全端工程師・網站架構", years: 8, type: "數位遊牧", skills: ["網站開發", "電商串接"], rating: 4.9, reviews: 86, from: 8000, img: "asset:t2.jpg", city: "清邁／台中" },
  { slug: "wang-yalin", name: "王雅琳", title: "營運管理與流程顧問", years: 15, type: "資深自由工作者", skills: ["營運流程", "專案管理"], rating: 4.8, reviews: 104, from: 5000, img: "asset:t3.jpg", city: "新竹" },
  { slug: "zhang-kaiting", name: "張凱婷", title: "品牌視覺設計師", years: 10, type: "數位遊牧", skills: ["品牌識別", "包裝設計"], rating: 5.0, reviews: 67, from: 6500, img: "asset:t4.jpg", city: "峇里島／台北" },
];

export function findSampleTalent(id: string): Talent | undefined {
  return SAMPLE_TALENTS.find((talent) => talent.slug === id || talent.name === id);
}
