// 下部タブバーの画面（要件定義書 6 章。作戦ボードを入れて4画面）。画面を足すときはここに1行足す。
export type TabId = 'record' | 'analysis' | 'board' | 'admin'

export interface Tab {
  id: TabId
  label: string
}

export const TABS: readonly Tab[] = [
  { id: 'record', label: '記録' },
  { id: 'analysis', label: '分析' },
  { id: 'board', label: '作戦' },
  { id: 'admin', label: '管理' },
]
