// 下部タブバーの画面（要件定義書 6 章。作戦ボードは拡張の F-23）。画面を足すときはここに1行足す。
export type TabId = 'record' | 'analysis' | 'admin' | 'board'

export interface Tab {
  id: TabId
  label: string
}

export const TABS: readonly Tab[] = [
  { id: 'record', label: '記録' },
  { id: 'analysis', label: '分析' },
  { id: 'admin', label: '管理' },
  { id: 'board', label: '作戦' },
]
