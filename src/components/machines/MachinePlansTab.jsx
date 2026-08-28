/**
 * MachinePlansTab — Le manutenzioni programmate
 *
 * Semaforo su ogni piano: rosso se scaduta, ambra se scade entro una
 * settimana, verde se è in regola. Le scadute stanno in cima e portano
 * il tasto "Fatto — Registra" a piena larghezza: chi è davanti alla
 * macchina con i guanti deve poterlo centrare senza mirare.
 */

import { CheckCircle, ShieldCheck } from 'lucide-react'
import { TabHeading, TabEmptyFrame } from './MachineTabParts'
import { padX } from './machineTabs'
import { EmptyState } from '../ui'
import ComponentPill from './ComponentPill'
import { useHaptic } from '../../hooks/useHaptic'
import { getTrafficLight } from '../../lib/maintenanceStatus'

export default function MachinePlansTab({ plans, planLastLogs, loading, onConfirmPlan }) {
  const haptic = useHaptic()

  if (loading) {
    return (
      <div className="flex flex-col gap-[3vw]" style={{ ...padX, paddingTop: '4vw', paddingBottom: '4vw' }}>
        {[0, 1].map(i => <div key={i} className="h-[96px] rounded-2xl skeleton-shimmer" />)}
      </div>
    )
  }

  if (plans.length === 0) {
    return (
      <TabEmptyFrame>
        <EmptyState
          icon={<ShieldCheck size={44} style={{ margin: '0 auto' }} className="text-faint" />}
          title="Nessuna manutenzione programmata"
          subtitle="I piani periodici si creano dalla scheda macchinario lato ufficio."
        />
      </TabEmptyFrame>
    )
  }

  const withLight = plans.map(plan => ({ plan, light: getTrafficLight(plan, planLastLogs[plan.id]) }))
  const urgent = withLight.filter(p => p.light.urgent)
  const ok = withLight.filter(p => !p.light.urgent)

  return (
    <div>
      <TabHeading>
        {plans.length} pian{plans.length === 1 ? 'o attivo' : 'i attivi'} ·{' '}
        {urgent.length > 0 ? `${urgent.length} da fare` : 'in regola'}
      </TabHeading>

      {urgent.map(({ plan, light }) => (
        <div key={plan.id} className="rounded-2xl overflow-hidden"
          style={{ margin: '0 4vw 4vw', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.22)' }}>
          <div className="flex items-center gap-[3.5vw]" style={{ ...padX, minHeight: 96 }}>
            <span
              className="w-3.5 h-3.5 rounded-full shrink-0"
              style={{ background: light.color, boxShadow: `0 0 12px ${light.color}80` }}
            />
            <div className="flex-1 min-w-0" style={{ paddingTop: '4vw', paddingBottom: '4vw' }}>
              <p className="text-[19px] font-bold text-themed break-words">{plan.name}</p>
              {plan.component?.name && (
                <span className="block" style={{ marginTop: 6 }}>
                  <ComponentPill name={plan.component.name} size="sm" />
                </span>
              )}
              <p className="font-mono text-[11px] uppercase tracking-wider text-faint truncate" style={{ marginTop: 6 }}>
                Ogni {plan.frequency_days}g · {plan.assigned_to_name || 'Non assegnato'}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="font-mono text-[15px]" style={{ color: light.color }}>
                {Math.abs(light.daysLeft)}g
              </p>
              <p className="font-mono text-[9.5px] uppercase tracking-wider text-faint">
                {light.daysLeft <= 0 ? 'in ritardo' : 'residui'}
              </p>
            </div>
          </div>
          <button
            onClick={() => { haptic.medium(); onConfirmPlan?.(plan) }}
            className="w-full h-[68px] text-lg font-bold text-white flex items-center justify-center gap-2.5 press-scale transition-all"
            style={{ background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)' }}
          >
            <CheckCircle size={24} /> Fatto — Registra
          </button>
        </div>
      ))}

      {ok.map(({ plan, light }) => (
        <div
          key={plan.id}
          className="flex items-center gap-[3.5vw] border-t"
          style={{ ...padX, minHeight: 96, borderColor: 'var(--color-border-subtle)' }}
        >
          <span
            className="w-3.5 h-3.5 rounded-full shrink-0"
            style={{ background: light.color, boxShadow: `0 0 8px ${light.color}60` }}
          />
          <div className="flex-1 min-w-0" style={{ paddingTop: '4vw', paddingBottom: '4vw' }}>
            <p className="text-[19px] font-bold text-themed break-words">{plan.name}</p>
            {plan.component?.name && (
              <span className="block" style={{ marginTop: 6 }}>
                <ComponentPill name={plan.component.name} size="sm" />
              </span>
            )}
            <p className="font-mono text-[11px] uppercase tracking-wider text-faint truncate" style={{ marginTop: 6 }}>
              Ogni {plan.frequency_days}g · {plan.assigned_to_name || 'Non assegnato'}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="font-mono text-[15px]" style={{ color: light.color }}>{light.daysLeft}g</p>
            <p className="font-mono text-[9.5px] uppercase tracking-wider text-faint">residui</p>
          </div>
        </div>
      ))}

      {ok.length > 0 && <div className="border-b" style={{ borderColor: 'var(--color-border-subtle)' }} />}
    </div>
  )
}
