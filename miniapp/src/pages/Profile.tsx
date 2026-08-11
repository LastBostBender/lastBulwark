// miniapp/src/pages/Profile.tsx
// Componente que muestra el perfil del jugador

import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';

// Definimos el tipo de datos que esperamos del perfil
interface Profile {
  nombre_personaje: string;
  nivel: number;
  zona: string;
  clase: string;
  xp_total: number;
  fue: number;
  int: number;
  agi: number;
  energia: number;
}

export const Profile = () => {
  // Estado para guardar los datos del perfil
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ID fijo para pruebas (cámbialo por tu propio Telegram ID si quieres)
  const TEST_TELEGRAM_ID = 123456;

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        setLoading(true);
        // Llamamos a Supabase para obtener el perfil con ese ID
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('telegram_id', TEST_TELEGRAM_ID)
          .single();

        if (error) throw error;
        setProfile(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, []);

  // Mientras carga
  if (loading) {
    return (
      <div className="container mt-5 text-center">
        <div className="spinner-border text-light" role="status">
          <span className="visually-hidden">Cargando...</span>
        </div>
        <p className="mt-3 text-secondary">Consultando el Bastión...</p>
      </div>
    );
  }

  // Si hay error
  if (error) {
    return (
      <div className="container mt-5">
        <div className="alert alert-danger" role="alert">
          <i className="bi bi-exclamation-triangle-fill me-2"></i>
          No se pudo cargar el perfil: {error}
        </div>
      </div>
    );
  }

  // Si no hay perfil (el ID no existe en la base de datos)
  if (!profile) {
    return (
      <div className="container mt-5">
        <div className="alert alert-warning" role="alert">
          <i className="bi bi-person-slash me-2"></i>
          No hay un perfil para este ID. Prueba con otro número.
        </div>
      </div>
    );
  }

  // Renderizado del perfil (con Bootstrap)
  return (
    <div className="container mt-4">
      <div className="row justify-content-center">
        <div className="col-md-8 col-lg-6">
          <div className="card bg-dark text-light border-secondary shadow">
            <div className="card-header bg-secondary bg-opacity-25 border-bottom border-secondary">
              <h5 className="mb-0">
                <i className="bi bi-person-badge me-2"></i>
                {profile.nombre_personaje || 'Sin nombre'}
              </h5>
            </div>
            <div className="card-body">
              <div className="row g-3">
                <div className="col-6">
                  <p className="text-secondary mb-0 small">Nivel</p>
                  <p className="fs-4 fw-bold">{profile.nivel}</p>
                </div>
                <div className="col-6">
                  <p className="text-secondary mb-0 small">Clase</p>
                  <p className="fs-4 fw-bold">{profile.clase}</p>
                </div>
                <div className="col-6">
                  <p className="text-secondary mb-0 small">Zona</p>
                  <p className="fs-6">{profile.zona}</p>
                </div>
                <div className="col-6">
                  <p className="text-secondary mb-0 small">Energía</p>
                  <p className="fs-6">{profile.energia} / 5</p>
                </div>
                <div className="col-12">
                  <p className="text-secondary mb-0 small">XP total</p>
                  <p className="fs-5">{profile.xp_total}</p>
                </div>
                <div className="col-4">
                  <span className="badge bg-danger">FUE {profile.fue}</span>
                </div>
                <div className="col-4">
                  <span className="badge bg-primary">INT {profile.int}</span>
                </div>
                <div className="col-4">
                  <span className="badge bg-success">AGI {profile.agi}</span>
                </div>
              </div>
            </div>
            <div className="card-footer bg-transparent border-secondary text-center">
              <small className="text-secondary">
                <i className="bi bi-calendar-event me-1"></i>
                Última actualización: hace unos segundos
              </small>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Profile;
