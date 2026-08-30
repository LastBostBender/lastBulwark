import { useState, useCallback, useEffect } from 'react';
import { Layout } from './Layout';
import { getTheme } from '../utils/themes';
import { supabase } from '../services/supabase';

interface MercadoViewProps {
  perfil: {
    telegram_id: number;
    nombre_personaje: string;
    nivel: number;
    zona: string;
    clase: string;
    oro: number;
    aura: number;
  };
  onNavigate?: (vista: 'perfil' | 'mazmorra' | 'inventario' | 'poderes' | 'mercado') => void;
}

type CategoriaId =
  | 'cabeza' | 'torso' | 'pantalones' | 'pies' | 'accesorio' | 'arma'
  | 'chatarra' | 'usable' | 'aura' | 'alquimia' | 'herreria';

interface Categoria {
  id: CategoriaId;
  titulo: string;
  icono: string; // sin el prefijo 'bi-'
  navegable: boolean;
}

// Orden pedido: equipo primero por slot, después Chatarra/Consumibles/Aura, crafteo al final.
// Ícono de cada slot reutiliza el mismo mapeo que InventarioView (ICONO_SLOT) para consistencia visual.
const CATEGORIAS: Categoria[] = [
  { id: 'cabeza', titulo: 'Cabeza', icono: 'sunglasses', navegable: true },
  { id: 'torso', titulo: 'Torso', icono: 'postage-fill', navegable: true },
  { id: 'pantalones', titulo: 'Pantalones', icono: 'box', navegable: true },
  { id: 'pies', titulo: 'Pies', icono: 'cloud-fog2', navegable: true },
  { id: 'accesorio', titulo: 'Accesorio', icono: 'watch', navegable: true },
  { id: 'arma', titulo: 'Arma', icono: 'hammer', navegable: true },
  { id: 'chatarra', titulo: 'Chatarra', icono: 'gear-wide-connected', navegable: true },
  { id: 'usable', titulo: 'Consumibles', icono: 'apple', navegable: true },
  { id: 'aura', titulo: 'Tienda de Aura', icono: 'ticket-detailed', navegable: true },
  { id: 'alquimia', titulo: 'Alquimia', icono: 'beaker', navegable: false },
  { id: 'herreria', titulo: 'Herrería', icono: 'bricks', navegable: false },
];

interface ItemTienda {
  id: number;
  nombre: string;
  descripcion: string;
  icono: string;
  nivel_minimo: number;
  origen: 'tienda_oro' | 'tienda_aura';
  valor_base: number | null;
  precio_compra_aura: number | null;
}

const MOTIVO_MENSAJE: Record<string, string> = {
  cantidad_invalida: 'Cantidad inválida.',
  item_inexistente: 'Ese objeto ya no existe en el catálogo.',
  no_disponible_en_tienda: 'Ese objeto no está a la venta.',
  perfil_inexistente: 'No se pudo encontrar tu perfil.',
  nivel_insuficiente: 'Tu nivel no alcanza para esto.',
  oro_insuficiente: 'No te alcanza el oro.',
  aura_insuficiente: 'No te alcanza el aura.',
  bolsa_llena: 'No hay espacio en tu bolsa para esto.',
};

export const MercadoView = ({ perfil, onNavigate }: MercadoViewProps) => {
  const theme = getTheme(perfil.zona);
  const [categoria, setCategoria] = useState<Categoria | null>(null);
  const [items, setItems] = useState<ItemTienda[]>([]);
  const [cargandoItems, setCargandoItems] = useState(false);
  const [comprando, setComprando] = useState<number | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [avisoCrafteo, setAvisoCrafteo] = useState<Categoria | null>(null);

  const abrirCategoria = useCallback(async (cat: Categoria) => {
    if (!cat.navegable) {
      setAvisoCrafteo(cat);
      return;
    }
    setCategoria(cat);
    setMensaje(null);
    setCargandoItems(true);

    let query = supabase
      .from('item_definitions')
      .select('id, nombre, descripcion, icono, nivel_minimo, origen, valor_base, precio_compra_aura');

    if (cat.id === 'aura') {
      query = query.eq('origen', 'tienda_aura');
    } else if (cat.id === 'usable') {
      query = query.eq('origen', 'tienda_oro').eq('tipo', 'usable');
    } else if (cat.id === 'chatarra') {
      query = query.eq('origen', 'tienda_oro').eq('tipo', 'chatarra');
    } else {
      query = query.eq('origen', 'tienda_oro').eq('tipo', 'equipamiento').eq('slot_equipo', cat.id);
    }

    const { data, error } = await query.order('nivel_minimo').order('nombre');
    if (error) {
      console.error('Error cargando ítems de tienda:', error);
      setMensaje('No se pudo cargar esta tienda.');
    } else {
      setItems((data ?? []) as ItemTienda[]);
    }
    setCargandoItems(false);
  }, []);

  const volver = () => {
    setCategoria(null);
    setItems([]);
    setMensaje(null);
  };

  const comprar = async (item: ItemTienda) => {
    if (comprando) return;
    setComprando(item.id);
    setMensaje(null);
    const { data, error } = await supabase.rpc('tienda_comprar', {
      p_telegram_id: perfil.telegram_id,
      p_item_id: item.id,
      p_cantidad: 1,
    });
    setComprando(null);

    if (error) {
      console.error('Error en tienda_comprar:', error);
      setMensaje('Algo falló al comprar.');
      return;
    }
    if (!data?.ok) {
      setMensaje(MOTIVO_MENSAJE[data?.motivo] ?? 'No se pudo comprar.');
      return;
    }
    // perfil.oro / perfil.aura se actualizan solos: Profile.tsx ya tiene una
    // suscripción Realtime a UPDATE de profiles que patchea el estado.
    setMensaje(data.motivo === 'parcial' ? 'Se compró, pero la bolsa está casi llena.' : `¡${item.nombre} comprado!`);
  };

  useEffect(() => {
    setMensaje(null);
  }, [categoria]);

  const primeraFila = CATEGORIAS.slice(0, CATEGORIAS.length - (CATEGORIAS.length % 2 === 1 ? 1 : 0));
  const ultimaSuelta = CATEGORIAS.length % 2 === 1 ? CATEGORIAS[CATEGORIAS.length - 1] : null;

  return (
    <Layout
      nombre={perfil.nombre_personaje}
      clase={perfil.clase}
      nivel={perfil.nivel}
      zona={perfil.zona}
      vistaActual="mercado"
      onNavigate={onNavigate}
    >
      <div style={{ fontFamily: 'var(--font-body)', color: theme.text }}>
        {/* ---- Header de saldo ---- */}
        <div
          className="d-flex justify-content-center mb-3 pb-2"
          style={{ gap: '1.5rem', borderBottom: `1px solid ${theme.border}`, fontFamily: 'var(--font-display)' }}
        >
          <span><i className="bi bi-coin me-1" style={{ color: theme.accent }}></i>{perfil.oro ?? 0}</span>
          <span><i className="bi bi-ticket-detailed me-1" style={{ color: theme.accent }}></i>{perfil.aura ?? 0}</span>
        </div>

        {avisoCrafteo && (
          <div
            className="text-center mb-3 p-2"
            style={{ border: `1px dashed ${theme.border}`, borderRadius: '6px', fontSize: '0.85rem' }}
            onClick={() => setAvisoCrafteo(null)}
          >
            <i className={`bi bi-${avisoCrafteo.icono} me-1`}></i> Hombres trabajando. Manténgase alejado.
          </div>
        )}

        {/* ---- Grilla de tiendas ---- */}
        {!categoria && (
          <div>
            <div
              className="mb-2"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: '0.75rem',
              }}
            >
              {primeraFila.map((cat) => (
                <button
                  key={cat.id}
                  className="btn d-flex flex-column align-items-center justify-content-center"
                  onClick={() => abrirCategoria(cat)}
                  style={{
                    aspectRatio: '1.4 / 1',
                    backgroundColor: theme.cardBg,
                    border: `1px solid ${theme.border}`,
                    borderRadius: '10px',
                    color: theme.text,
                    gap: '0.4rem',
                  }}
                >
                  <i className={`bi bi-${cat.icono}`} style={{ fontSize: '1.8rem', color: theme.accent }}></i>
                  <span style={{ fontSize: '0.85rem', fontFamily: 'var(--font-display)' }}>{cat.titulo}</span>
                </button>
              ))}
            </div>

            {ultimaSuelta && (
              <div className="d-flex justify-content-center">
                <button
                  className="btn d-flex flex-column align-items-center justify-content-center"
                  onClick={() => abrirCategoria(ultimaSuelta)}
                  style={{
                    width: '50%',
                    aspectRatio: '1.4 / 1',
                    backgroundColor: theme.cardBg,
                    border: `1px solid ${theme.border}`,
                    borderRadius: '10px',
                    color: theme.text,
                    gap: '0.4rem',
                  }}
                >
                  <i className={`bi bi-${ultimaSuelta.icono}`} style={{ fontSize: '1.8rem', color: theme.accent }}></i>
                  <span style={{ fontSize: '0.85rem', fontFamily: 'var(--font-display)' }}>{ultimaSuelta.titulo}</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* ---- Interior de una tienda ---- */}
        {categoria && (
          <div>
            <div className="d-flex align-items-center mb-3" style={{ gap: '0.6rem' }}>
              <button
                className="btn d-flex align-items-center justify-content-center"
                onClick={volver}
                style={{ border: 'none', color: theme.text, padding: 0, fontSize: '1.4rem' }}
              >
                <i className="bi bi-arrow-left"></i>
              </button>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem' }}>{categoria.titulo}</span>
            </div>

            {mensaje && (
              <div className="mb-2" style={{ fontSize: '0.85rem', color: mensaje.includes('comprado') || mensaje.includes('bolsa está') ? '#3fd15c' : '#ff6b6b' }}>
                {mensaje}
              </div>
            )}

            {cargandoItems && <p className="text-center mt-4">Cargando...</p>}

            {!cargandoItems && items.length === 0 && (
              <p className="text-center mt-4" style={{ opacity: 0.7 }}>Todavía no hay nada cargado acá.</p>
            )}

            <div className="d-flex flex-column" style={{ gap: '0.6rem' }}>
              {items.map((item) => {
                const precio = item.origen === 'tienda_oro' ? item.valor_base : item.precio_compra_aura;
                const saldo = item.origen === 'tienda_oro' ? perfil.oro ?? 0 : perfil.aura ?? 0;
                const sinNivel = perfil.nivel < item.nivel_minimo;
                const sinSaldo = precio != null && saldo < precio;
                const deshabilitado = sinNivel || sinSaldo || comprando === item.id;

                return (
                  <div
                    key={item.id}
                    className="d-flex align-items-center"
                    style={{
                      gap: '0.7rem',
                      backgroundColor: theme.cardBg,
                      border: `1px solid ${theme.border}`,
                      borderRadius: '8px',
                      padding: '0.6rem',
                    }}
                  >
                    <i className={`bi bi-${item.icono || 'question-circle'}`} style={{ fontSize: '1.4rem', color: theme.accent }}></i>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.9rem', fontFamily: 'var(--font-display)' }}>{item.nombre}</div>
                      <div style={{ fontSize: '0.75rem', opacity: 0.75 }}>
                        {precio ?? '—'} {item.origen === 'tienda_oro' ? 'oro' : 'aura'}
                        {item.nivel_minimo > 1 && ` · Nivel mín. ${item.nivel_minimo}`}
                      </div>
                    </div>
                    <button
                      className="btn btn-sm"
                      disabled={deshabilitado}
                      onClick={() => comprar(item)}
                      style={{
                        border: `1px solid ${deshabilitado ? theme.text + '40' : theme.accent}`,
                        color: deshabilitado ? theme.text + '40' : theme.accent,
                        backgroundColor: 'transparent',
                      }}
                      title={sinNivel ? `Requiere nivel ${item.nivel_minimo}` : sinSaldo ? 'Saldo insuficiente' : 'Comprar'}
                    >
                      Comprar
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};
