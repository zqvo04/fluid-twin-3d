/**
 * Top application bar: brand, a Plant ▸ Area breadcrumb that doubles as the
 * cross-page navigation, and the steady/water-hammer scene switch. The
 * breadcrumb is the spine of the multi-view platform — one click returns to the
 * plant overview from any section workspace.
 */

import { useAppStore } from './store';
import { plantSections } from '../domain/network';
import { PLANT_ROUTE } from './routing';

export function TopBar() {
  const route = useAppStore((s) => s.route);
  const network = useAppStore((s) => s.network);
  const navigate = useAppStore((s) => s.navigate);
  const scene = useAppStore((s) => s.scene);
  const setScene = useAppStore((s) => s.setScene);

  const sections = plantSections(network);
  const active = route.page === 'section' ? sections.find((s) => s.id === route.sectionId) : null;

  return (
    <header className="topbar">
      <div className="brand">
        <span className="mark" aria-hidden />
        FluidTwin
        <small>Digital Twin</small>
      </div>

      <nav className="breadcrumb" aria-label="Location">
        <span
          className={`crumb${route.page === 'plant' ? ' current' : ''}`}
          onClick={() => navigate(PLANT_ROUTE)}
          role="link"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && navigate(PLANT_ROUTE)}
        >
          Plant
        </span>
        {active && (
          <>
            <span className="sep">▸</span>
            <span className="crumb current">
              <span className="swatch" style={{ background: active.color }} />
              {active.name}
            </span>
          </>
        )}
      </nav>

      <div className="topbar-spacer" />

      <div className="topbar-right">
        <div className="scene-switch" role="tablist">
          <button
            role="tab"
            aria-selected={scene === 'network'}
            className={scene === 'network' ? 'active' : ''}
            onClick={() => setScene('network')}
          >
            Steady / Network
          </button>
          <button
            role="tab"
            aria-selected={scene === 'waterhammer'}
            className={scene === 'waterhammer' ? 'active' : ''}
            onClick={() => setScene('waterhammer')}
          >
            Water Hammer
          </button>
        </div>
      </div>
    </header>
  );
}
