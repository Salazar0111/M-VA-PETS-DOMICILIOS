require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Cliente sin sesión persistente: cada petición valida su propio token.
// Compartir estado de sesión entre peticiones mezclaría usuarios.
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function obtenerPerfil(userId) {
  const { data, error } = await supabase
    .from('perfiles')
    .select('nombre, rol, activo')
    .eq('id', userId)
    .single();

  if (error) throw new Error('El usuario no tiene un perfil asignado');
  if (!data.activo) throw new Error('Esta cuenta está desactivada');
  return data;
}

async function iniciarSesion(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error('Correo o contraseña incorrectos');

  const perfil = await obtenerPerfil(data.user.id);

  return {
    token: data.session.access_token,
    expiraEn: data.session.expires_at,
    usuario: { id: data.user.id, email: data.user.email, nombre: perfil.nombre, rol: perfil.rol },
  };
}

async function usuarioDesdeToken(token) {
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) throw new Error('Sesión inválida o expirada');

  const perfil = await obtenerPerfil(data.user.id);
  return { id: data.user.id, email: data.user.email, nombre: perfil.nombre, rol: perfil.rol };
}

module.exports = { iniciarSesion, usuarioDesdeToken };
