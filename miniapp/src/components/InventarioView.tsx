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
  onNavigate?: (vista: 'perfil' | 'mazmorra' | 'inventario' | 'poderes' | 'mercado') => void;
}

type ItemTipo = 'equipamiento' | 'usable' | 'chatarra';
type Rareza = 'gris' | 'blanco' | 'verde' | 'azul' | 'morado' | 'naranja';
type SlotEquipo = 'cabeza' | 'torso' | 'pantalones' | 'pies' | 'accesorio' | 'arma';

interface ItemRow {
  character_item_id: number;
  item_id: number;
  nombre: string;
  tipo: ItemTipo;
  rareza: Rareza | null;
  slot_equipo: SlotEquipo | null;
  descripcion: string;
  icono: string;
  efecto: { stats?: Record<string, number>; pasiva?: string | null; duracion_minutos?: number; duracion_turnos?: number } | null;
  cantidad: number;
  equipado: boolean;
  power_id: number | null;
  power_nombre: string | null;
  power_descripcion: string | null;
  power_icono: string | null;
  nivel_minimo: number;
  precio_venta_oro: number | null;
  contexto_uso: 'descanso' | 'combate';
}

type TierBolsa = 'pequena' | 'media' | 'grande' | 'epica';

interface BolsaRow {
  bolsa_id: number;
  tier: TierBolsa;
  abierta: boolean;
  creado_en: string;
  expira_en: string;
  rareza_maxima: Rareza | null;
}

interface ContenidoBolsaItem {
  contenido_id: number;
  tipo: 'oro' | 'item';
  item_id: number | null;
  nombre: string;
  descripcion: string | null;
  icono: string | null;
  rareza: Rareza | null;
  efecto: { stats?: Record<string, number>; pasiva?: string | null; duracion_minutos?: number; duracion_turnos?: number } | null;
  cantidad: number;
  retirado: boolean;
  vendible: boolean;
  precio_venta_oro: number | null;
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
  cabeza: 'bi-sunglasses',
  torso: 'bi-postage-fill',
  pantalones: 'bi-box',
  pies: 'bi-cloud-fog2',
  accesorio: 'bi-watch',
  arma: 'bi-hammer',
};

const ETIQUETA_SLOT: Record<SlotEquipo, string> = {
  cabeza: 'Cabeza',
  torso: 'Torso',
  pantalones: 'Pantalones',
  pies: 'Pies',
  accesorio: 'Accesorio',
  arma: 'Arma',
};

// Disposición de los 6 slots como los puntos de un dado (⚅): 2 columnas x 3 filas.
const POSICION_DADO: Record<SlotEquipo, { gridColumn: number; gridRow: number }> = {
  cabeza: { gridColumn: 1, gridRow: 1 },
  arma: { gridColumn: 2, gridRow: 1 },
  torso: { gridColumn: 1, gridRow: 2 },
  accesorio: { gridColumn: 2, gridRow: 2 },
  pantalones: { gridColumn: 1, gridRow: 3 },
  pies: { gridColumn: 2, gridRow: 3 },
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

const TITULO_TIER_BOLSA: Record<TierBolsa, string> = {
  pequena: 'Bolsa pequeña',
  media: 'Bolsa mediana',
  grande: 'Bolsa grande',
  epica: 'Bolsa épica',
};

// Color de identidad FIJO por tier de bolsa (no por la rareza de lo que
// tenga adentro): así se sabe qué tan buena es de un vistazo sin abrirla.
const TIER_COLOR_BOLSA: Record<TierBolsa, string> = {
  pequena: '#f2f2f2',
  media: '#3fd15c',
  grande: '#2e93f0',
  epica: '#ff9a2e',
};

// Slot combinado de la sección Consumibles: una bolsa activa ocupa un hueco
// propio ahí mismo, igual que un ítem — no tiene sección aparte ni se acumula.
type SlotUsable = { kind: 'bolsa'; bolsa: BolsaRow } | { kind: 'item'; item: ItemRow };

const NOMBRE_STAT: Record<string, string> = {
  ataque_fisico: 'Ataque físico',
  ataque_magico: 'Ataque mágico',
  defensa_fisica: 'Defensa física',
  defensa_magica: 'Defensa mágica',
  ps_actual: 'Puntos de salud',
  ps_max: 'Puntos de salud máx.',
  pm_actual: 'Puntos de maná',
  pm_max: 'Puntos de maná máx.',
  regen_ps: 'Regeneración de salud',
  regen_pm: 'Regeneración de maná',
  precision_stat: 'Precisión',
  escape: 'Escape',
};

const nombreStat = (clave: string) => NOMBRE_STAT[clave] ?? clave.replace(/_/g, ' ');

// Estandar de íconos para consumibles: flask (descanso) / flask-florence (combate).
// El campo `icono` del catálogo manda si viene seteado; esto es solo el fallback.
const iconoItem = (it: ItemRow, fallbackGenerico: string): string => {
  if (it.icono) return it.icono;
  if (it.tipo === 'usable') return it.contexto_uso === 'combate' ? 'flask-florence' : 'flask';
  return fallbackGenerico;
};

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
  nivel_insuficiente: 'Tu nivel no alcanza para equipar esto.',
  no_vendible: 'Ese objeto no se puede vender.',
  exclusivo_de_combate: 'Ese consumible solo se puede usar en combate.',
  buff_ya_activo: 'Ya tienes ese efecto activo. Espera a que termine.',
};

const MOTIVO_MENSAJE_BOLSA: Record<string, string> = {
  bolsa_no_encontrada: 'Esa bolsa ya no está disponible.',
  bolsa_expirada: 'Esa bolsa expiró.',
  slot_no_encontrado: 'Ese objeto ya no está en la bolsa.',
  ya_retirado: 'Ya se resolvió ese objeto.',
  no_vendible: 'Ese objeto no se puede vender.',
  bolsa_llena: 'No hay espacio en tu inventario para eso.',
};

export const InventarioView = ({ perfil, onNavigate }: InventarioViewProps) => {
  const [items, setItems] = useState<ItemRow[]>([]);
  const [cargando, setCargando] = useState(true);
  const [seleccionado, setSeleccionado] = useState<ItemRow | null>(null);
  const [procesando, setProcesando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const [bolsas, setBolsas] = useState<BolsaRow[]>([]);
  const [bolsaAbierta, setBolsaAbierta] = useState<BolsaRow | null>(null);
  const [contenidoBolsa, setContenidoBolsa] = useState<ContenidoBolsaItem[] | null>(null);
  const [cargandoContenidoBolsa, setCargandoContenidoBolsa] = useState(false);
  const [slotExpandido, setSlotExpandido] = useState<number | null>(null);
  const [procesandoBolsa, setProcesandoBolsa] = useState(false);
  const [mensajeBolsa, setMensajeBolsa] = useState<string | null>(null);

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

  const cargarBolsas = useCallback(async () => {
    const { data, error } = await supabase.rpc('bolsa_listar_activas', { p_telegram_id: perfil.telegram_id });
    if (error) {
      console.error('Error cargando bolsas:', error);
      return;
    }
    setBolsas((data ?? []) as BolsaRow[]);
  }, [perfil.telegram_id]);

  useEffect(() => {
    cargarInventario();
    cargarBolsas();
  }, [cargarInventario, cargarBolsas]);

  const equipados: Partial<Record<SlotEquipo, ItemRow>> = {};
  for (const it of items) {
    if (it.equipado && it.slot_equipo) equipados[it.slot_equipo] = it;
  }

  const seccion = (tipo: ItemTipo) => items.filter((it) => !it.equipado && it.tipo === tipo);
  const secciones: ItemTipo[] = ['equipamiento', 'usable', 'chatarra'];

  const abrirItem = (it: ItemRow) => {
    setMensaje(null);
    setSeleccionado(it);
    setBolsaAbierta(null);
  };

  const cerrarModal = () => {
    if (procesando) return;
    setSeleccionado(null);
    setMensaje(null);
  };

  const ejecutarAccion = async (
    fn: 'inv_equipar' | 'inv_desequipar' | 'inv_usar' | 'inv_eliminar' | 'tienda_vender',
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

  const abrirBolsa = async (b: BolsaRow) => {
    setSeleccionado(null);
    setMensajeBolsa(null);
    setSlotExpandido(null);
    setBolsaAbierta(b);
    setCargandoContenidoBolsa(true);
    const { data, error } = await supabase.rpc('bolsa_obtener_contenido', {
      p_telegram_id: perfil.telegram_id,
      p_bolsa_id: b.bolsa_id,
    });
    setCargandoContenidoBolsa(false);
    if (error || !data?.ok) {
      console.error('Error abriendo bolsa:', error || data);
      setMensajeBolsa('No se pudo abrir la bolsa.');
      setContenidoBolsa([]);
      return;
    }
    setContenidoBolsa(((data.contenido ?? []) as ContenidoBolsaItem[]).filter((c) => !c.retirado));
    // Abrir la bolsa la marca 'abierta' en el backend (ícono box-fill -> dropbox);
    // se refresca la grilla para reflejarlo.
    cargarBolsas();
  };

  const cerrarBolsa = () => {
    if (procesandoBolsa) return;
    setBolsaAbierta(null);
    setContenidoBolsa(null);
    setMensajeBolsa(null);
  };

  const ejecutarAccionBolsa = async (
    fn: 'bolsa_retirar_slot' | 'bolsa_vender_slot' | 'bolsa_descartar_slot',
    contenidoId: number
  ) => {
    if (!bolsaAbierta || procesandoBolsa) return;
    setProcesandoBolsa(true);
    setMensajeBolsa(null);
    const { data, error } = await supabase.rpc(fn, {
      p_telegram_id: perfil.telegram_id,
      p_bolsa_id: bolsaAbierta.bolsa_id,
      p_contenido_id: contenidoId,
    });
    setProcesandoBolsa(false);

    if (error || !data?.ok) {
      console.error(`Error en ${fn}:`, error || data);
      setMensajeBolsa(MOTIVO_MENSAJE_BOLSA[data?.motivo] ?? 'No se pudo procesar ese objeto.');
      return;
    }

    if (data.bolsa_vacia) {
      cerrarBolsa();
      cargarBolsas();
    } else {
      setContenidoBolsa((prev) => (prev ?? []).filter((c) => c.contenido_id !== contenidoId));
      setSlotExpandido(null);
      cargarBolsas();
    }
    // Puede haber cambiado el inventario (objeto añadido) o el oro (vendido/retirado).
    await cargarInventario();
  };

  const ejecutarAccionBolsaTotal = async (
    fn: 'bolsa_retirar_todo' | 'bolsa_vender_todo' | 'bolsa_descartar_todo'
  ) => {
    if (!bolsaAbierta || procesandoBolsa) return;
    setProcesandoBolsa(true);
    setMensajeBolsa(null);
    const { data, error } = await supabase.rpc(fn, {
      p_telegram_id: perfil.telegram_id,
      p_bolsa_id: bolsaAbierta.bolsa_id,
    });
    setProcesandoBolsa(false);

    if (error || !data?.ok) {
      console.error(`Error en ${fn}:`, error || data);
      setMensajeBolsa(MOTIVO_MENSAJE_BOLSA[data?.motivo] ?? 'No se pudo procesar la bolsa.');
      return;
    }

    if (data.bolsa_vacia) {
      cerrarBolsa();
      cargarBolsas();
    } else {
      // Algo quedó pendiente (ej. "vender todo" salteó lo no vendible, o
      // "tomar todo" no pudo con algo por falta de espacio): se refresca el
      // contenido real en vez de asumir que se vació.
      await abrirBolsa(bolsaAbierta);
    }
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
        <p className="text-center mt-5" style={{ fontFamily: 'var(--font-body)', color: theme.text }}>
          Cargando inventario...
        </p>
      </Layout>
    );
  }

  const nivelInsuficiente =
    !!seleccionado && seleccionado.tipo === 'equipamiento' && perfil.nivel < seleccionado.nivel_minimo;

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
          <i className="bi bi-person-arms-up" style={{ fontSize: '2.6rem', color: theme.text }}></i>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 2.6rem)',
              gridTemplateRows: 'repeat(3, 2.6rem)',
              columnGap: '0.4rem',
              rowGap: '0.4rem',
            }}
          >
            {(Object.keys(POSICION_DADO) as SlotEquipo[]).map((slot) => {
              const it = equipados[slot];
              const pos = POSICION_DADO[slot];
              const borde = it?.rareza ? COLOR_RAREZA[it.rareza] : `${theme.text}50`;
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
                    color: it ? borde : theme.text,
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
            const objetosItem = seccion(tipo);
            const capacidad = CAPACIDAD[tipo];
            const columnas = COLUMNAS_POR_SECCION[tipo];

            // Las bolsas comparten hueco con los consumibles: cada una ocupa
            // un slot propio, no se acumulan entre sí ni con los ítems.
            const slotsCombinados: SlotUsable[] =
              tipo === 'usable'
                ? [
                    ...bolsas.map((b) => ({ kind: 'bolsa' as const, bolsa: b })),
                    ...objetosItem.map((it) => ({ kind: 'item' as const, item: it })),
                  ]
                : [];
            const ocupados = tipo === 'usable' ? slotsCombinados.length : objetosItem.length;
            const slots =
              tipo === 'usable'
                ? Array.from({ length: capacidad }, (_, i) => slotsCombinados[i] ?? null)
                : Array.from({ length: capacidad }, (_, i) => objetosItem[i] ?? null);

            return (
              <div key={tipo} className="mb-3">
                <div
                  className="d-flex align-items-center mb-2"
                  style={{ color: theme.accent, fontSize: '0.8rem', gap: '0.4rem' }}
                >
                  <i className={`bi ${ICONO_SECCION[tipo]}`}></i>
                  <span>{TITULO_SECCION[tipo]}</span>
                  <span style={{ marginLeft: 'auto', color: theme.text }}>
                    {ocupados}/{capacidad}
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
                  {slots.map((slot, i) => {
                    // Slot de bolsa: color e ícono fijos por tier (no por la
                    // rareza de lo que tenga adentro), para reconocerla sin abrirla.
                    if (tipo === 'usable' && (slot as SlotUsable | null)?.kind === 'bolsa') {
                      const b = (slot as Extract<SlotUsable, { kind: 'bolsa' }>).bolsa;
                      const borde = TIER_COLOR_BOLSA[b.tier];
                      return (
                        <button
                          key={`bolsa-${b.bolsa_id}`}
                          onClick={() => abrirBolsa(b)}
                          title={TITULO_TIER_BOLSA[b.tier]}
                          style={{
                            position: 'relative',
                            aspectRatio: '1 / 1',
                            borderRadius: '6px',
                            border: `2px solid ${borde}`,
                            backgroundColor: theme.cardBg,
                            color: borde,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: 0,
                            cursor: 'pointer',
                          }}
                        >
                          <i className={`bi ${b.abierta ? 'bi-dropbox' : 'bi-box-fill'}`} style={{ fontSize: '1.2rem' }}></i>
                        </button>
                      );
                    }

                    const it = tipo === 'usable' ? (slot as Extract<SlotUsable, { kind: 'item' }> | null)?.item ?? null : (slot as ItemRow | null);
                    const borde = it?.rareza ? COLOR_RAREZA[it.rareza as Rareza] : `${theme.text}50`;
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
                          color: theme.text,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          padding: 0,
                          cursor: it ? 'pointer' : 'default',
                        }}
                      >
                        {it && (
                          <>
                            <i className={`bi bi-${iconoItem(it, ICONO_SECCION[tipo].replace('bi-', ''))}`} style={{ fontSize: '1.2rem' }}></i>
                            {it.cantidad > 1 && (
                              <span
                                style={{
                                  position: 'absolute',
                                  bottom: '1px',
                                  right: '3px',
                                  fontSize: '0.65rem',
                                  color: theme.text,
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
              border: `2px solid ${seleccionado.rareza ? COLOR_RAREZA[seleccionado.rareza] : theme.text + '50'}`,
              borderRadius: '8px',
              padding: '1rem',
              fontFamily: 'var(--font-body)',
              color: theme.text,
            }}
          >
            <div className="d-flex align-items-center mb-2" style={{ gap: '0.5rem' }}>
              <i
                className={`bi bi-${iconoItem(seleccionado, 'question-circle')}`}
                style={{
                  fontSize: '1.4rem',
                  color: seleccionado.rareza ? COLOR_RAREZA[seleccionado.rareza] : theme.accent,
                }}
              ></i>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: '0.95rem' }}>{seleccionado.nombre}</span>
            </div>

            <div style={{ fontSize: '0.85rem', color: theme.text, marginBottom: '0.4rem' }}>
              Tipo: {TITULO_SECCION[seleccionado.tipo].replace(/s$/, '')}
              {seleccionado.slot_equipo && ` · ${ETIQUETA_SLOT[seleccionado.slot_equipo]}`}
              {seleccionado.rareza && (
                <span style={{ color: COLOR_RAREZA[seleccionado.rareza] }}> · {seleccionado.rareza}</span>
              )}
              {seleccionado.tipo === 'equipamiento' && seleccionado.nivel_minimo > 1 && (
                <span style={{ color: nivelInsuficiente ? '#ff6b6b' : theme.text }}>
                  {' '}· Nivel mín. {seleccionado.nivel_minimo}
                </span>
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
                {!!seleccionado.efecto?.duracion_minutos && (
                  <div style={{ color: theme.text, opacity: 0.8 }}>
                    Duración: {seleccionado.efecto.duracion_minutos} min reales
                  </div>
                )}
                {!!seleccionado.efecto?.duracion_turnos && (
                  <div style={{ color: theme.text, opacity: 0.8 }}>
                    Duración: {seleccionado.efecto.duracion_turnos} turno{seleccionado.efecto.duracion_turnos > 1 ? 's' : ''}
                  </div>
                )}
                {seleccionado.power_id && (
                  <div>
                    <i className={`bi bi-${seleccionado.power_icono || 'stars'} me-1`}></i>
                    Función: {seleccionado.power_nombre}
                    {seleccionado.power_descripcion && ` — ${seleccionado.power_descripcion}`}
                  </div>
                )}
                {!seleccionado.efecto?.stats?.[Object.keys(seleccionado.efecto?.stats ?? {})[0]] &&
                  !seleccionado.efecto?.pasiva &&
                  !seleccionado.power_id && <div style={{ color: theme.text }}>Sin efecto asociado.</div>}
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
                  style={{
                    width: '2.2rem',
                    height: '2.2rem',
                    border: `1px solid ${nivelInsuficiente ? theme.text + '50' : theme.accent}`,
                    color: nivelInsuficiente ? theme.text + '50' : theme.accent,
                    backgroundColor: 'transparent',
                  }}
                  disabled={procesando || nivelInsuficiente}
                  onClick={() => ejecutarAccion('inv_equipar')}
                  title={nivelInsuficiente ? `Requiere nivel ${seleccionado.nivel_minimo}` : 'Equipar'}
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
                  style={{ width: '2.2rem', height: '2.2rem', border: `1px solid ${theme.accent}`, color: theme.accent, backgroundColor: 'transparent', opacity: seleccionado.contexto_uso === 'combate' ? 0.4 : 1 }}
                  disabled={procesando || seleccionado.contexto_uso === 'combate'}
                  onClick={() => ejecutarAccion('inv_usar')}
                  title={seleccionado.contexto_uso === 'combate' ? 'Exclusivo de combate' : 'Usar'}
                >
                  <i className="bi bi-person-plus"></i>
                </button>
              )}

              {!seleccionado.equipado && seleccionado.precio_venta_oro != null && (
                <button
                  className="btn rounded-circle d-flex align-items-center justify-content-center"
                  style={{ width: '2.2rem', height: '2.2rem', border: `1px solid ${theme.accent}`, color: theme.accent, backgroundColor: 'transparent' }}
                  disabled={procesando}
                  onClick={() => ejecutarAccion('tienda_vender', { p_cantidad: seleccionado.cantidad })}
                  title={`Vender por ${seleccionado.precio_venta_oro * seleccionado.cantidad} crédito`}
                >
                  <i className="bi bi-cash-coin"></i>
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

              <button
                className="btn rounded-circle d-flex align-items-center justify-content-center"
                style={{ width: '2.2rem', height: '2.2rem', border: `1px solid ${theme.text}80`, color: theme.text, backgroundColor: 'transparent' }}
                disabled={procesando}
                onClick={cerrarModal}
                title="Cerrar"
              >
                <i className="bi bi-x-lg"></i>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---- Modal de contenido de bolsa ---- */}
      {bolsaAbierta && (
        <div
          onClick={cerrarBolsa}
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
              maxWidth: '340px',
              maxHeight: '80vh',
              display: 'flex',
              flexDirection: 'column',
              backgroundColor: theme.cardBg,
              border: `2px solid ${TIER_COLOR_BOLSA[bolsaAbierta.tier]}`,
              borderRadius: '8px',
              padding: '1rem',
              fontFamily: 'var(--font-body)',
              color: theme.text,
            }}
          >
            <div className="d-flex align-items-center justify-content-between mb-2">
              <span style={{ fontFamily: 'var(--font-display)', fontSize: '0.95rem' }}>
                {TITULO_TIER_BOLSA[bolsaAbierta.tier]}
              </span>
              <button
                className="btn rounded-circle d-flex align-items-center justify-content-center"
                style={{ width: '2rem', height: '2rem', border: `1px solid ${theme.text}80`, color: theme.text, backgroundColor: 'transparent' }}
                disabled={procesandoBolsa}
                onClick={cerrarBolsa}
                title="Cerrar"
              >
                <i className="bi bi-x-lg"></i>
              </button>
            </div>

            <hr style={{ borderColor: `${theme.border}60`, margin: '0 0 0.5rem 0' }} />

            {mensajeBolsa && (
              <div className="mb-2" style={{ fontSize: '0.8rem', color: '#ff6b6b' }}>
                {mensajeBolsa}
              </div>
            )}

            {/* ---- Scroll interno ---- */}
            <div style={{ flex: 1, overflowY: 'auto', marginBottom: '0.6rem' }}>
              {cargandoContenidoBolsa && (
                <p className="text-center" style={{ opacity: 0.7 }}>Cargando...</p>
              )}
              {!cargandoContenidoBolsa && contenidoBolsa && contenidoBolsa.length === 0 && (
                <p className="text-center" style={{ opacity: 0.7 }}>La bolsa está vacía.</p>
              )}
              {!cargandoContenidoBolsa &&
                contenidoBolsa?.map((it) => {
                  const expandido = slotExpandido === it.contenido_id;
                  const colorIcono = it.tipo === 'oro' ? '#e6c34a' : it.rareza ? COLOR_RAREZA[it.rareza] : theme.accent;
                  return (
                    <div key={it.contenido_id} style={{ borderBottom: `1px solid ${theme.border}40` }}>
                      <button
                        onClick={() =>
                          it.tipo === 'item' &&
                          setSlotExpandido((prev) => (prev === it.contenido_id ? null : it.contenido_id))
                        }
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.6rem',
                          width: '100%',
                          textAlign: 'left',
                          background: 'transparent',
                          border: 'none',
                          padding: '0.4rem 0.2rem',
                          fontFamily: 'var(--font-body)',
                          fontSize: '0.95rem',
                          color: theme.text,
                          cursor: it.tipo === 'item' ? 'pointer' : 'default',
                        }}
                      >
                        <i
                          className={`bi bi-${it.tipo === 'oro' ? 'coin' : it.icono || 'question-circle'}`}
                          style={{ color: colorIcono, fontSize: '1.1rem' }}
                        ></i>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div>
                            {it.nombre}
                            {it.cantidad > 1 ? ` x${it.cantidad}` : ''}
                          </div>
                          {it.rareza && (
                            <div style={{ fontSize: '0.7rem', color: colorIcono }}>{it.rareza}</div>
                          )}
                        </div>
                        {it.tipo === 'item' && (
                          <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: theme.text }}>
                            <i className={`bi bi-${expandido ? 'chevron-up' : 'chevron-right'}`}></i>
                          </span>
                        )}
                      </button>

                      {expandido && it.tipo === 'item' && (
                        <div style={{ padding: '0 0.2rem 0.4rem 1.8rem', fontSize: '0.85rem' }}>
                          {(() => {
                            const entradas = Object.entries(it.efecto?.stats ?? {});
                            if (entradas.length === 0 && !it.efecto?.pasiva && !it.efecto?.duracion_minutos && !it.efecto?.duracion_turnos) {
                              return <div style={{ opacity: 0.7 }}>Sin efecto asociado.</div>;
                            }
                            return (
                              <>
                                {entradas.map(([k, v]) => (
                                  <div key={k} style={{ color: theme.accent }}>
                                    {v >= 0 ? '+' : ''}{v} {nombreStat(k)}
                                  </div>
                                ))}
                                {it.efecto?.pasiva && <div>Pasiva: {it.efecto.pasiva}</div>}
                                {!!it.efecto?.duracion_minutos && (
                                  <div style={{ opacity: 0.8 }}>Duración: {it.efecto.duracion_minutos} min reales</div>
                                )}
                                {!!it.efecto?.duracion_turnos && (
                                  <div style={{ opacity: 0.8 }}>
                                    Duración: {it.efecto.duracion_turnos} turno{it.efecto.duracion_turnos > 1 ? 's' : ''}
                                  </div>
                                )}
                              </>
                            );
                          })()}
                        </div>
                      )}

                      <div style={{ padding: '0 0.2rem 0.6rem 1.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <button
                          className="btn rounded-circle d-flex align-items-center justify-content-center"
                          disabled={procesandoBolsa}
                          onClick={() => ejecutarAccionBolsa('bolsa_retirar_slot', it.contenido_id)}
                          style={{ width: '1.9rem', height: '1.9rem', border: `1px solid ${theme.accent}`, color: theme.accent, backgroundColor: 'transparent' }}
                          title="Añadir al inventario"
                        >
                          <i className="bi bi-bag-heart"></i>
                        </button>

                        {/* No todos los objetos son vendibles (ej. algunos ítems, o
                            si en algún momento hay chatarra sin precio_venta_oro) --
                            en ese caso el botón de vender directamente no aparece. */}
                        {it.vendible && (
                          <button
                            className="btn rounded-circle d-flex align-items-center justify-content-center"
                            disabled={procesandoBolsa}
                            onClick={() => ejecutarAccionBolsa('bolsa_vender_slot', it.contenido_id)}
                            style={{ width: '1.9rem', height: '1.9rem', border: `1px solid ${theme.accent}`, color: theme.accent, backgroundColor: 'transparent' }}
                            title={`Vender por ${(it.precio_venta_oro ?? 0) * it.cantidad} crédito`}
                          >
                            <i className="bi bi-cash-coin"></i>
                          </button>
                        )}

                        <button
                          className="btn rounded-circle d-flex align-items-center justify-content-center"
                          disabled={procesandoBolsa}
                          onClick={() => ejecutarAccionBolsa('bolsa_descartar_slot', it.contenido_id)}
                          style={{ width: '1.9rem', height: '1.9rem', border: '1px solid #ff6b6b', color: '#ff6b6b', backgroundColor: 'transparent' }}
                          title="Descartar"
                        >
                          <i className="bi bi-trash"></i>
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>

            {/* ---- Acciones masivas: mismos íconos que arriba, sobre toda la bolsa.
                Si "tomar todo"/"vender todo" no pueden con algún objeto (sin
                espacio, no vendible), ese objeto simplemente queda en la bolsa
                para resolverlo aparte -- nunca aborta el resto. ---- */}
            <div
              className="d-flex justify-content-center"
              style={{ gap: '0.8rem', borderTop: `1px solid ${theme.border}60`, paddingTop: '0.6rem' }}
            >
              <button
                className="btn rounded-circle d-flex align-items-center justify-content-center"
                disabled={procesandoBolsa || !contenidoBolsa?.length}
                onClick={() => ejecutarAccionBolsaTotal('bolsa_retirar_todo')}
                style={{ width: '2.4rem', height: '2.4rem', border: `1px solid ${theme.accent}`, color: theme.accent, backgroundColor: 'transparent' }}
                title="Tomar todo"
              >
                <i className="bi bi-bag-heart"></i>
              </button>
              <button
                className="btn rounded-circle d-flex align-items-center justify-content-center"
                disabled={procesandoBolsa || !contenidoBolsa?.length}
                onClick={() => ejecutarAccionBolsaTotal('bolsa_vender_todo')}
                style={{ width: '2.4rem', height: '2.4rem', border: `1px solid ${theme.accent}`, color: theme.accent, backgroundColor: 'transparent' }}
                title="Vender todo"
              >
                <i className="bi bi-cash-coin"></i>
              </button>
              <button
                className="btn rounded-circle d-flex align-items-center justify-content-center"
                disabled={procesandoBolsa || !contenidoBolsa?.length}
                onClick={() => ejecutarAccionBolsaTotal('bolsa_descartar_todo')}
                style={{ width: '2.4rem', height: '2.4rem', border: '1px solid #ff6b6b', color: '#ff6b6b', backgroundColor: 'transparent' }}
                title="Descartar todo"
              >
                <i className="bi bi-trash"></i>
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
};
