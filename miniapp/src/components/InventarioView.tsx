import { useState, useEffect, useCallback } from 'react';
import { Layout } from './Layout';
import { getTheme } from '../utils/themes';
import { supabase } from '../services/supabase';

interface InventarioViewProps {
  perfil: {
    telegram_id: number;
    nombre_personaje: string;
    nivel: number;
    zona: string;
    clase: string;
  };
  onNavigate?: (vista: 'perfil' | 'mazmorra' | 'inventario' | 'poderes') => void;
}

type ItemTipo = 'equipamiento' | 'usable' | 'chatarra';
type Rareza = 'gris' | 'blanco' | 'verde' | 'azul' | 'morado' | 'naranja';
type SlotEquipo = 'cabeza' | 'torso' | 'pantalones' | 'pies' | 'accesorio';

interface ItemRow {
  character_item_id: number;
  item_id: number;
  nombre: string;
  tipo: ItemTipo;
  rareza: Rareza | null;
  slot_equipo: SlotEquipo | null;
  descripcion: string;
  icono: string;
  efecto: { stats?: Record<string, number>; pasiva?: string | null } | null;
  cantidad: number;
  equipado: boolean;
  power_id: number | null;
  power_nombre: string | null;
  power_descripcion: string | null;
  power_icono: string | null;
}

const CAPACIDAD: Record<ItemTipo, number> = {
  equipamiento: 12,
  usable: 24,
  chatarra: 24,
};

const COLUMNAS_POR_SECCION: Record<ItemTipo, number> = {
  equipamiento: 2,
  usable: 4,
  chatarra: 4,
};

const COLOR_RAREZA: Record<Rareza, string> = {
  gris: '#9d9d9d',
  blanco: '#f2f2f2',
  verde: '#3fd15c',
  azul: '#2e93f0',
  morado: '#a25bec',
  naranja: '#ff9a2e',
};

const ICONO_SLOT: Record<SlotEquipo, string> = {
  cabeza: 'bi-badge-hd',
  torso: 'bi-vest',
  pantalones: 'bi-align-bottom',
  pies: 'bi-boot',
  accesorio: 'bi-gem',
};

const ETIQUETA_SLOT: Record<SlotEquipo, string> = {
  cabeza: 'Cabeza',
  torso: 'Torso',
  pantalones: 'Pantalones',
  pies: 'Pies',
  accesorio: 'Accesorio',
};

// Disposición de los 5 slots como los puntos de un dado (⁙): 4 esquinas + centro.
const POSICION_DADO: Record<SlotEquipo, { gridColumn: number; gridRow: number }> = {
  cabeza: { gridColumn: 1, gridRow: 1 },
  torso: { gridColumn: 3, gridRow: 1 },
  accesorio: { gridColumn: 2, gridRow: 2 },
  pantalones: { gridColumn: 1, gridRow: 3 },
  pies: { gridColumn: 3, gridRow: 3 },
};

const ICONO_SECCION: Record<ItemTipo, string> = {
  equipamiento: 'bi-bag-heart',
  usable: 'bi-apple',
  chatarra: 'bi-gear-wide-connected',
};

const TITULO_SECCION: Record<ItemTipo, string> = {
  equipamiento: 'Equipos',
  usable: 'Consumibles',
  chatarra: 'Chatarra',
};

const NOMBRE_STAT: Record<string, string> = {
  ataque_fisico: 'Ataque físico',
  ataque_magico: 'Ataque mágico',
  defensa_fisica: 'Defensa física',
  defensa_magica: 'Defensa mágica',
  ps_actual: 'Puntos de salud',
  ps_max: 'Puntos de salud máx.',
  pm_actual: 'Puntos de maná',
  pm_max: 'Puntos de maná máx.',
};

const nombreStat = (clave: string) => NOMBRE_STAT[clave] ?? clave.replace(/_/g, ' ');

const MOTIVO_MENSAJE: Record<string, string> = {
  bolsa_llena: 'No hay espacio en esa sección de la bolsa.',
  parcial: 'Solo entró parte del lote: la sección se llenó.',
  item_no_encontrado: 'Ese objeto ya no está disponible.',
  item_inexistente: 'Ese objeto ya no existe en el catálogo.',
  no_es_equipable: 'Ese objeto no se puede equipar.',
  no_es_usable: 'Ese objeto no se puede usar.',
  ya_equipado: 'Ese objeto ya está equipado.',
  no_esta_equipado: 'Ese objeto no está equipado.',
  debe_desequiparse_primero: 'Desequípalo antes de eliminarlo.',
  cantidad_invalida: 'Cantidad inválida.',
};

export const InventarioView = ({ perfil, onNavigate }: InventarioViewProps) => {
  const [items, setItems] = useState<ItemRow[]>([]);
  const [cargando, setCargando] = useState(true);
  const [seleccionado, setSeleccionado] = useState<ItemRow | null>(null);
  const [procesando, setProcesando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const theme = getTheme(perfil.zona);

  const cargarInventario = useCallback(async () => {
    const { data, error } = await supabase.rpc('inv_obtener', { p_telegram_id: perfil.telegram_id });
    if (error) {
      console.error('Error cargando inventario:', error);
      setMensaje('No se pudo cargar el inventario.');
    } else {
      setItems((data ?? []) as ItemRow[]);
    }
    setCargando(false);
  }, [perfil.telegram_id]);

  useEffect(() => {
    cargarInventario();
  }, [cargarInventario]);

  const equipados: Partial<Record<SlotEquipo, ItemRow>> = {};
  for (const it of items) {
    if (it.equipado && it.slot_equipo) equipados[it.slot_equipo] = it;
  }

  const seccion = (tipo: ItemTipo) => items.filter((it) => !it.equipado && it.tipo === tipo);
  const secciones: ItemTipo[] = ['equipamiento', 'usable', 'chatarra'];

  const abrirItem = (it: ItemRow) => {
    setMensaje(null);
    setSeleccionado(it);
  };

  const cerrarModal = () => {
    if (procesando) return;
    setSeleccionado(null);
    setMensaje(null);
  };

  const ejecutarAccion = async (
    fn: 'inv_equipar' | 'inv_desequipar' | 'inv_usar' | 'inv_eliminar',
    extra?: Record<string, unknown>
  ) => {
    if (!seleccionado || procesando) return;
    setProcesando(true);
    setMensaje(null);
    const { data, error } = await supabase.rpc(fn, {
      p_telegram_id: perfil.telegram_id,
      p_character_item_id: seleccionado.character_item_id,
      ...extra,
    });
    setProcesando(false);

    if (error) {
      console.error(`Error en ${fn}:`, error);
      setMensaje('Algo falló al procesar el objeto.');
      return;
    }
    if (data && data.ok === false) {
      setMensaje(MOTIVO_MENSAJE[data.motivo] ?? 'No se pudo completar la acción.');
      return;
    }

    // Eliminar y usar (consumido) cierran el modal; equipar/desequipar lo mantienen abierto
    // pero con el estado ya invertido, así que también se cierra para evitar mostrar datos viejos.
    setSeleccionado(null);
    await cargarInventario();
  };

  if (cargando) {
    return (
      <Layout
        nombre={perfil.nombre_personaje}
        clase={perfil.clase}
        nivel={perfil.nivel}
        zona={perfil.zona}
        vistaActual="inventario"
        onNavigate={onNavigate}
      >
        <p className="text-center mt-5" style={{ fontFamily: 'var(--font-body)', color: theme.border }}>
          Cargando inventario...
        </p>
      </Layout>
    );
  }

  return (
    <Layout
      nombre={perfil.nombre_personaje}
      clase={perfil.clase}
      nivel={perfil.nivel}
      zona={perfil.zona}
      vistaActual="inventario"
      onNavigate={onNavigate}
    >
      <div style={{ fontFamily: 'var(--font-body)' }}>
        {/* ---- Equipamiento (fijo) ---- */}
        <div
          className="mb-3 pb-3"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '1.5rem',
            borderBottom: `1px solid ${theme.border}`,
          }}
        >
          <i className="bi bi-person-arms-up" style={{ fontSize: '2.6rem', color: theme.border }}></i>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 2.6rem)',
              gridTemplateRows: 'repeat(3, 2.6rem)',
              columnGap: '0.4rem',
              rowGap: '0.4rem',
            }}
          >
            {(Object.keys(POSICION_DADO) as SlotEquipo[]).map((slot) => {
              const it = equipados[slot];
              const pos = POSICION_DADO[slot];
              const borde = it?.rareza ? COLOR_RAREZA[it.rareza] : theme.border;
              return (
                <button
                  key={slot}
                  onClick={() => it && abrirItem(it)}
                  title={ETIQUETA_SLOT[slot]}
                  style={{
                    gridColumn: pos.gridColumn,
                    gridRow: pos.gridRow,
                    width: '2.6rem',
                    height: '2.6rem',
                    borderRadius: '50%',
                    border: `2px solid ${borde}`,
                    backgroundColor: it ? `${borde}22` : 'transparent',
                    color: it ? borde : theme.border,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 0,
                    cursor: it ? 'pointer' : 'default',
                  }}
                >
                  <i className={`bi ${it ? it.icono ? `bi-${it.icono}` : ICONO_SLOT[slot] : ICONO_SLOT[slot]}`} style={{ fontSize: '1.1rem' }}></i>
                </button>
              );
            })}
          </div>
        </div>

        {/* ---- Bolsa (scrolleable) ---- */}
        <div style={{ maxHeight: 'calc(100vh - 340px)', overflowY: 'auto', paddingBottom: '0.5rem' }}>
          {secciones.map((tipo) => {
            const objetos = seccion(tipo);
            const capacidad = CAPACIDAD[tipo];
            const columnas = COLUMNAS_POR_SECCION[tipo];
            const slots = Array.from({ length: capacidad }, (_, i) => objetos[i] ?? null);

            return (
              <div key={tipo} className="mb-3">
                <div
                  className="d-flex align-items-center mb-2"
                  style={{ color: theme.accent, fontSize: '0.8rem', gap: '0.4rem' }}
                >
                  <i className={`bi ${ICONO_SECCION[tipo]}`}></i>
                  <span>{TITULO_SECCION[tipo]}</span>
                  <span style={{ marginLeft: 'auto', color: theme.border }}>
                    {objetos.length}/{capacidad}
                  </span>
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(6, 1fr)',
                    gridTemplateRows: `repeat(${columnas}, 1fr)`,
                    gap: '0.4rem',
                  }}
                >
                  {slots.map((it, i) => {
                    const borde = it?.rareza ? COLOR_RAREZA[it.rareza] : `${theme.border}80`;
                    return (
                      <button
                        key={it ? it.character_item_id : `vacio-${tipo}-${i}`}
                        onClick={() => it && abrirItem(it)}
                        style={{
                          position: 'relative',
                          aspectRatio: '1 / 1',
                          borderRadius: '6px',
                          border: `2px ${it ? 'solid' : 'dashed'} ${borde}`,
                          backgroundColor: it ? theme.cardBg : 'transparent',
                          color: it ? theme.text : theme.border,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          padding: 0,
                          cursor: it ? 'pointer' : 'default',
                        }}
                      >
                        {it && (
                          <>
                            <i className={`bi bi-${it.icono || ICONO_SECCION[tipo].replace('bi-', '')}`} style={{ fontSize: '1.2rem' }}></i>
                            {it.cantidad > 1 && (
                              <span
                                style={{
                                  position: 'absolute',
                                  bottom: '1px',
                                  right: '3px',
                                  fontSize: '0.65rem',
                                  color: theme.border,
                                  lineHeight: 1,
                                }}
                              >
                                {it.cantidad}
                              </span>
                            )}
                          </>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ---- Modal de detalle ---- */}
      {seleccionado && (
        <div
          onClick={cerrarModal}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
            padding: '1.5rem',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: '320px',
              backgroundColor: theme.cardBg,
              border: `2px solid ${seleccionado.rareza ? COLOR_RAREZA[seleccionado.rareza] : theme.border}`,
              borderRadius: '8px',
              padding: '1rem',
              fontFamily: 'var(--font-body)',
              color: theme.text,
            }}
          >
            <div className="d-flex align-items-center mb-2" style={{ gap: '0.5rem' }}>
              <i
                className={`bi bi-${seleccionado.icono || 'question-circle'}`}
                style={{
                  fontSize: '1.4rem',
                  color: seleccionado.rareza ? COLOR_RAREZA[seleccionado.rareza] : theme.accent,
                }}
              ></i>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: '0.95rem' }}>{seleccionado.nombre}</span>
            </div>

            <div style={{ fontSize: '0.85rem', color: theme.border, marginBottom: '0.4rem' }}>
              Tipo: {TITULO_SECCION[seleccionado.tipo].replace(/s$/, '')}
              {seleccionado.slot_equipo && ` · ${ETIQUETA_SLOT[seleccionado.slot_equipo]}`}
              {seleccionado.rareza && (
                <span style={{ color: COLOR_RAREZA[seleccionado.rareza] }}> · {seleccionado.rareza}</span>
              )}
            </div>

            <p style={{ fontSize: '0.95rem', marginBottom: '0.6rem' }}>{seleccionado.descripcion}</p>

            {seleccionado.tipo !== 'chatarra' && (
              <div
                style={{
                  borderTop: `1px solid ${theme.border}60`,
                  paddingTop: '0.5rem',
                  marginBottom: '0.6rem',
                  fontSize: '0.85rem',
                }}
              >
                {seleccionado.efecto?.stats && Object.keys(seleccionado.efecto.stats).length > 0 && (
                  <div className="mb-1">
                    {Object.entries(seleccionado.efecto.stats).map(([k, v]) => (
                      <div key={k}>
                        {nombreStat(k)}: {v > 0 ? `+${v}` : v}
                      </div>
                    ))}
                  </div>
                )}
                {seleccionado.efecto?.pasiva && <div>Pasiva: {seleccionado.efecto.pasiva}</div>}
                {seleccionado.power_id && (
                  <div>
                    <i className={`bi bi-${seleccionado.power_icono || 'stars'} me-1`}></i>
                    Función: {seleccionado.power_nombre}
                    {seleccionado.power_descripcion && ` — ${seleccionado.power_descripcion}`}
                  </div>
                )}
                {!seleccionado.efecto?.stats?.[Object.keys(seleccionado.efecto?.stats ?? {})[0]] &&
                  !seleccionado.efecto?.pasiva &&
                  !seleccionado.power_id && <div style={{ color: theme.border }}>Sin efecto asociado.</div>}
              </div>
            )}

            {mensaje && (
              <div className="mb-2" style={{ fontSize: '0.8rem', color: '#ff6b6b' }}>
                {mensaje}
              </div>
            )}

            <div className="d-flex justify-content-end" style={{ gap: '0.6rem' }}>
              {seleccionado.tipo === 'equipamiento' && !seleccionado.equipado && (
                <button
                  className="btn rounded-circle d-flex align-items-center justify-content-center"
                  style={{ width: '2.2rem', height: '2.2rem', border: `1px solid ${theme.accent}`, color: theme.accent, backgroundColor: 'transparent' }}
                  disabled={procesando}
                  onClick={() => ejecutarAccion('inv_equipar')}
                  title="Equipar"
                >
                  <i className="bi bi-person-plus"></i>
                </button>
              )}

              {seleccionado.tipo === 'equipamiento' && seleccionado.equipado && (
                <button
                  className="btn rounded-circle d-flex align-items-center justify-content-center"
                  style={{ width: '2.2rem', height: '2.2rem', border: `1px solid ${theme.accent}`, color: theme.accent, backgroundColor: 'transparent' }}
                  disabled={procesando}
                  onClick={() => ejecutarAccion('inv_desequipar')}
                  title="Desequipar"
                >
                  <i className="bi bi-person-dash-fill"></i>
                </button>
              )}

              {seleccionado.tipo === 'usable' && (
                <button
                  className="btn rounded-circle d-flex align-items-center justify-content-center"
                  style={{ width: '2.2rem', height: '2.2rem', border: `1px solid ${theme.accent}`, color: theme.accent, backgroundColor: 'transparent' }}
                  disabled={procesando}
                  onClick={() => ejecutarAccion('inv_usar')}
                  title="Usar"
                >
                  <i className="bi bi-person-plus"></i>
                </button>
              )}

              {!seleccionado.equipado && (
                <button
                  className="btn rounded-circle d-flex align-items-center justify-content-center"
                  style={{ width: '2.2rem', height: '2.2rem', border: '1px solid #ff6b6b', color: '#ff6b6b', backgroundColor: 'transparent' }}
                  disabled={procesando}
                  onClick={() => ejecutarAccion('inv_eliminar')}
                  title="Botar del inventario"
                >
                  <i className="bi bi-trash"></i>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
};
