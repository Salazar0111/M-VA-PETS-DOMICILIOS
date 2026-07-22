const { usuarioDesdeToken } = require('../services/auth');

// Exige un token válido. Deja el usuario en req.usuario.
async function requiereSesion(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;

  if (!token) {
    return res.status(401).json({ error: 'Inicia sesión para continuar' });
  }

  try {
    req.usuario = await usuarioDesdeToken(token);
    next();
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
}

// Exige uno de los roles indicados. Usar siempre después de requiereSesion.
function requiereRol(...roles) {
  return (req, res, next) => {
    if (!req.usuario || !roles.includes(req.usuario.rol)) {
      return res.status(403).json({ error: 'No tienes permiso para esta acción' });
    }
    next();
  };
}

module.exports = { requiereSesion, requiereRol };
