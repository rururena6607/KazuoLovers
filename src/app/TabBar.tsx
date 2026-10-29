import { TABS, type TabId } from './tabs.ts'

interface Props {
  active: TabId
  onSelect: (id: TabId) => void
}

export default function TabBar({ active, onSelect }: Props) {
  return (
    <nav className="tabbar">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className="tabbar-item"
          onClick={() => onSelect(tab.id)}
          aria-current={tab.id === active ? 'page' : undefined}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  )
}
