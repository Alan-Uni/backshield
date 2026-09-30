import jwt from 'jsonwebtoken';
import 'dotenv/config';

export const verificarToken = (req, res, next) => {
    // 1. Extraer el token del header
    const token = req.header('x-auth-token'); 

    if (!token) {
        return res.status(401).json({ 
            success: false, 
            msg: "Se requiere un token para la autenticación" 
        });
    }

    try {
        // 2. Verificar el token
        // 'cifrado' ahora contiene: { id, rol, tipo, iat, exp }
        const cifrado = jwt.verify(token, process.env.JWT_SECRET);
        
        // 3. Sincronización Crítica:
        // Como en el Login guardaste los datos directo en el payload,
        // pasamos 'cifrado' completo a 'req.usuario'.
        req.usuario = cifrado; 
        
        next();
    } catch (error) {
        console.error("Error de JWT:", error.message);
        res.status(401).json({ success: false, msg: 'Token no válido o expirado' });
    }
};

/**
 * Requerimiento Forense: Control de acceso por roles
 * Ajustado para usar req.usuario (que es donde guardamos los datos arriba)
 */
export const esAuditor = (req, res, next) => {
    if (!req.usuario || req.usuario.rol !== 'Auditor') {
        return res.status(403).json({ 
            success: false, 
            message: "Acceso denegado: Se requieren permisos de Auditor" 
        });
    }
    next();
};