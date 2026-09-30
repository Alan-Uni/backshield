import sql from 'mssql';
import crypto from 'crypto'; // Para generar el hash de verificación
import { poolPromise } from './db.js';

export const registrarEvento = async (datos) => {
    const { usuarioId, accion, resultado, ip, detalles } = datos;
    
    // Normalización para cumplir con CHECK (resultado IN ('exito', 'error'))
    const resultadoNormalizado = resultado.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    const idParaLog = usuarioId ? usuarioId : null;
    const detallesTexto = detalles || '';
    const fecha = new Date().toISOString();
    const cadenaData = `${idParaLog}-${accion}-${resultadoNormalizado}-${ip}-${detallesTexto}-${fecha}`;
    const hashVerificacion = crypto.createHash('sha256').update(cadenaData).digest('hex');

    try {
        const pool = await poolPromise;
        await pool.request()
            .input('usuario', sql.UniqueIdentifier, idParaLog)
            .input('accion', sql.VarChar, accion)
            .input('res', sql.VarChar, resultadoNormalizado) // Enviamos 'exito' o 'error'
            .input('ip', sql.VarChar, ip)
            .input('detalles', sql.NVarChar, detallesTexto)
            .input('modulo', sql.VarChar, 'AUTH_MODULE')
            .input('hash', sql.Char, hashVerificacion)
            .query(`INSERT INTO logs_forenses 
                   (usuario_ejecuta, fecha_hora_utc, accion_realizada, resultado, ip_origen, modulo_responsable, hash_verificacion, detalles_error)
                   VALUES (@usuario, SYSUTCDATETIME(), @accion, @res, @ip, @modulo, @hash, @detalles)`);
    } catch (err) {
        console.error('Error crítico en log forense:', err.message);
    }
};