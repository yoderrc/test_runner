const fs = require('fs');
const path = require('path');

const rutaArchivoSybase = path.join(process.cwd(), '../Sybase', 'BDsps.sql');
const rutaArchivoPostgresql = path.join(process.cwd(), '../PostgreSql', 'BDsps.sql');
const rutaListadoSps = path.join(process.cwd(), '../Listado_sps.json');

function extraerNombresDeObjetos(datosSQL, regex, grupoNombre) {
    const coincidencias = datosSQL.matchAll(regex);
    const nombres = [];
    for (const coincidencia of coincidencias) {
        nombres.push(coincidencia[grupoNombre].split('.').pop());
    }
    return nombres;
}

function procesarArchivoSybase() {
    return new Promise((resolver, rechazar) => {
        fs.readFile(rutaArchivoSybase, 'utf8', (err, datosSybase) => {
            if (err) {
                resolver({ nombresObjetosSybase: [], mensaje: 'El archivo de Sybase no existe.' });
                return;
            }

            if (!datosSybase.trim()) {
                resolver({ nombresObjetosSybase: [], mensaje: 'El archivo de Sybase está vacío.' });
                return;
            }

            const regexSybase = /create\s+(trigger|procedure|proc|function|func)\s+([a-zA-Z_]\w*)/gi;
            const nombresObjetosSybase = extraerNombresDeObjetos(datosSybase, regexSybase, 2);

            resolver({ nombresObjetosSybase, mensaje: '' });
        });
    });
}

function procesarArchivoPostgresql() {
    return new Promise((resolver, rechazar) => {
        fs.readFile(rutaArchivoPostgresql, 'utf8', (err, datosPostgresql) => {
            if (err) {
                resolver({ nombresObjetosPostgresql: [], mensaje: 'El archivo de PostgreSQL no existe.' });
                return;
            }

            if (!datosPostgresql.trim()) {
                resolver({ nombresObjetosPostgresql: [], mensaje: 'El archivo de PostgreSQL está vacío.' });
                return;
            }

            const regexPostgresql = /create\s+(or\s+replace\s+)?(procedure|function|trigger)\s+([\w.]+)\s*\(/gi;
            const nombresObjetosPostgresql = extraerNombresDeObjetos(datosPostgresql, regexPostgresql, 3);

            resolver({ nombresObjetosPostgresql, mensaje: '' });
        });
    });
}

function leerListadoSps() {
    return new Promise((resolver, rechazar) => {
        fs.readFile(rutaListadoSps, 'utf8', (err, datosListadoSps) => {
            if (err) {
                rechazar('Error leyendo el archivo Listado_sps.json: ' + err);
                return;
            }

            const listadoSps = JSON.parse(datosListadoSps);
            resolver(listadoSps);
        });
    });
}

function compararListas(lista1, lista2) {
    const enLista1NoEnLista2 = lista1.filter(objeto => !lista2.includes(objeto));
    const enLista2NoEnLista1 = lista2.filter(objeto => !lista1.includes(objeto));
    return { enLista1NoEnLista2, enLista2NoEnLista1 };
}

async function main() {
    try {
        const listadoSps = await leerListadoSps();
        const sybaseVacio = !(listadoSps.Sybase && listadoSps.Sybase.data.length);
        const postgresqlVacio = !(listadoSps.PostgreSql && listadoSps.PostgreSql.data.length);

        if (sybaseVacio && postgresqlVacio) {
            console.log('No hay nada que validar.');
            return;
        }

        let hayDiferencias = false;
        let hayError = false;

        if (!sybaseVacio) {
            let resultadoSybase = { nombresObjetosSybase: [], mensaje: 'El archivo de Sybase no existe.' };
            if (fs.existsSync(rutaArchivoSybase)) {
                resultadoSybase = await procesarArchivoSybase();
            } else {
                console.log('El archivo de Sybase no existe pero debería estar presente ya que hay objetos de Sybase en Listado_sps (Sybase).');
                hayError = true;
            }

            if (resultadoSybase.nombresObjetosSybase.length) {
                const nombresListadoSybase = listadoSps.Sybase.data.flatMap(db => [
                    ...(db.sps || []).map(obj => obj.nombre),
                    ...(db.trigger || []).map(obj => obj.nombre),
                    ...(db.func || []).map(obj => obj.nombre),
                ]);

                console.log("==================================================");
                console.log('Comparación entre Listado_sps (Sybase) y BDsps (Sybase):');
                console.log("==================================================");
                const comparacionSybase = compararListas(nombresListadoSybase, resultadoSybase.nombresObjetosSybase);
                console.log('En Listado_sps (Sybase) pero no en BDsps (Sybase):', comparacionSybase.enLista1NoEnLista2.length ? comparacionSybase.enLista1NoEnLista2 : 'NO HAY DIFERENCIAS');
                console.log('En BDsps (Sybase) pero no en Listado_sps (Sybase):', comparacionSybase.enLista2NoEnLista1.length ? comparacionSybase.enLista2NoEnLista1 : 'NO HAY DIFERENCIAS');
                console.log("");

                if (comparacionSybase.enLista1NoEnLista2.length || comparacionSybase.enLista2NoEnLista1.length) {
                    hayDiferencias = true;
                }
            } else {
                console.log(resultadoSybase.mensaje);
                hayError = true;
            }
        }

        if (!postgresqlVacio) {
            let resultadoPostgresql = { nombresObjetosPostgresql: [], mensaje: 'El archivo de PostgreSQL no existe.' };
            if (fs.existsSync(rutaArchivoPostgresql)) {
                resultadoPostgresql = await procesarArchivoPostgresql();
            } else {
                console.log('El archivo de PostgreSQL no existe pero debería estar presente ya que hay objetos de PostgreSQL en Listado_sps (PostgreSql).');
                hayError = true;
            }

            if (resultadoPostgresql.nombresObjetosPostgresql.length) {
                const nombresListadoPostgresql = listadoSps.PostgreSql.data.flatMap(db => [
                    ...(db.sps || []).map(obj => obj.nombre),
                    ...(db.trigger || []).map(obj => obj.nombre),
                    ...(db.func || []).map(obj => obj.nombre),
                ]);

                console.log("==================================================");
                console.log('Comparación entre Listado_sps (PostgreSql) y BDsps (PostgreSql):');
                console.log("==================================================");
                const comparacionPostgresql = compararListas(nombresListadoPostgresql, resultadoPostgresql.nombresObjetosPostgresql);
                console.log('En Listado_sps (PostgreSql) pero no en BDsps (PostgreSql):', comparacionPostgresql.enLista1NoEnLista2.length ? comparacionPostgresql.enLista1NoEnLista2 : 'NO HAY DIFERENCIAS');
                console.log('En BDsps (PostgreSql) pero no en Listado_sps (PostgreSql):', comparacionPostgresql.enLista2NoEnLista1.length ? comparacionPostgresql.enLista2NoEnLista1 : 'NO HAY DIFERENCIAS');
                console.log("");

                if (comparacionPostgresql.enLista1NoEnLista2.length || comparacionPostgresql.enLista2NoEnLista1.length) {
                    hayDiferencias = true;
                }
            } else {
                console.log(resultadoPostgresql.mensaje);
                hayError = true;
            }
        }

        if (hayDiferencias || hayError) {
            process.exit(1);
        }

    } catch (error) {
        console.error(error);
        process.exit(1);
    }
}

main();
