// Silencia el logger durante los tests. Va en `setupFiles` (antes de importar
// los módulos de prueba) porque el logger se configura al importarse.
process.env.LITEB_LOG_LEVEL = 'off';
