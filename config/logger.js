import { poolPromise } from './db.js';

export const registrarEvento = async (datos) => {
    const { usuarioId, accion, resultado, ip, detalles } = datos;
    try {
        const pool = await poolPromise;
        await pool.request()
            .input('usuario', sql.Int, usuarioId || null)
            .input('accion', sql.VarChar, accion)
            .input('res', sql.VarChar, resultado)
            .input('ip', sql.VarChar, ip)
            .input('detalles', sql.VarChar, detalles)
            // Usa UTC e ISO 8601 para marcas de tiempo confiables [cite: 105, 108, 112]
            .query(`INSERT INTO logs_forenses 
                   (usuario_ejecuta, fecha_hora_utc, accion_realizada, resultado, ip_origen, detalles_error)
                   VALUES (@usuario, SYSUTCDATETIME(), @accion, @res, @ip, @detalles)`);
    } catch (err) {
        console.error('Error crítico: No se pudo escribir en el log forense', err);
    }
};