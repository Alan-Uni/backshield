import jwt from 'jsonwebtoken';
import 'dotenv/config';

export const verificarToken = (req, res, next) => {
    const token = req.headers['authorization'];

    if (!token) {
        return res.status(403).json({ message: "Se requiere un token para la autenticación" });
    }

    try {
        // El token suele venir como "Bearer <token>"
        const bearerToken = token.split(' ')[1];
        const decoded = jwt.verify(bearerToken, process.env.JWT_SECRET);
        req.user = decoded; // Guardamos los datos del usuario (id, rol) en la petición
    } catch (err) {
        return res.status(401).json({ message: "Token inválido o expirado" });
    }
    return next();
};

// Requerimiento Forense: Control de acceso por roles
export const esAuditor = (req, res, next) => {
    if (req.user.rol !== 'Auditor') {
        return res.status(403).json({ message: "Acceso denegado: Se requieren permisos de Auditor" });
    }
    next();
};