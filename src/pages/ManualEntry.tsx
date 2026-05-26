import { useState } from 'react'
import { CBToneTab } from '../components/manual/CBToneTab'
import { ConsensusTab } from '../components/manual/ConsensusTab'
import { GeoRiskTab } from '../components/manual/GeoRiskTab'

const TABS = [
  { id: 'cb-tone', label: 'CB TONE', panel: CBToneTab },
  { id: 'geo-risk', label: 'GEO RISK', panel: GeoRiskTab },
  { id: 'consensus', label: 'CONSENSUS', panel: ConsensusTab },
] as const

type TabId = (typeof TABS)[number]['id']

export default function ManualEntry() {
  const [activeTab, setActiveTab] = useState<TabId>('cb-tone')

  const ActivePanel = TABS.find((tab) => tab.id === activeTab)?.panel ?? CBToneTab

  return (
    <div className="space-y-6">
      <header className="space-y-2 border-b border-border pb-6">
        <h1 className="font-display text-4xl italic text-foreground">
          Manual Entry
        </h1>
        <p className="font-mono text-xs text-muted">
          Operator-verified data inputs for the FSR scoring engine
        </p>
      </header>

      <div className="space-y-0">
        <div
          role="tablist"
          aria-label="Manual entry sections"
          className="flex bg-surface"
        >
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id

            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                id={`tab-${tab.id}`}
                aria-selected={isActive}
                aria-controls={`panel-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                className={[
                  'px-5 py-3 font-mono text-xs uppercase tracking-wide transition-colors',
                  isActive
                    ? 'border-b-2 border-gold text-foreground'
                    : 'border-b-2 border-transparent text-muted hover:text-foreground/80',
                ].join(' ')}
              >
                {tab.label}
              </button>
            )
          })}
        </div>

        <div
          role="tabpanel"
          id={`panel-${activeTab}`}
          aria-labelledby={`tab-${activeTab}`}
          className="pt-6"
        >
          <ActivePanel />
        </div>
      </div>
    </div>
  )
}
