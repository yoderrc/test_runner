const fs = require('fs');
const path = require('path');
const listadoSpsPath = path.join(process.cwd(), '../Listado_sps.json');
let listadoSpsData;

try {
  listadoSpsData = fs.readFileSync(listadoSpsPath, 'utf8');
} catch (err) {
  console.error('Error al leer el archivo Listado_sps.json:', err);
  process.exit(1);
}

let parsedData;
try {
  parsedData = JSON.parse(listadoSpsData);
} catch (err) {
  console.error('Error al parsear el archivo Listado_sps.json:', err);
  process.exit(1);
}

const transformData = (data, propertyNames) => {
  return {
    data: data.map(item => ({
      db: item.db,
      sps: propertyNames.flatMap(propertyName => item[propertyName]?.map(sp => sp.nombre) || [])
    }))
  };
};

let postgresData;
let sybaseData;

const propertyNames = ['sps', 'func', 'trigger'];

if ('PostgreSql' in parsedData) {
  postgresData = transformData(parsedData.PostgreSql.data, propertyNames);
}

if ('Sybase' in parsedData) {
  sybaseData = transformData(parsedData.Sybase.data, propertyNames);
}

let authData = JSON.stringify({
  "user": "$2a$12$XE3hFRS0CbwzIvTyniZMp.QSG18CPRleRWR8JaND7UoFu4SkC/X7K",
  "password": "$2a$12$PWzQzNvrR2p5OF0hBNMfdOiX06D5uXxEiOb9ki2/d0XT4XdbZ3I7K"
});

async function fetchWithTimeout(resource, options = {}) {
  const { timeout = 30000 } = options; 

  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  const response = await fetch(resource, {
    ...options,
    signal: controller.signal  
  });
  clearTimeout(id);
  return response;
}

async function getCheckList(data, url) {
  try {
    const authResponse = await fetchWithTimeout('http://192.168.55.62:3000/auth/loginuser', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: authData
    });

    const authResult = await authResponse.json();
    const token = authResult.token;

    const response = await fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(data)
    });

    const result = await response.json();
    return result;
  } catch (error) {
    console.log("Error al realizar la petición:", error);
    throw error;
  }
}

async function content_validate(dataDB) {
  const keywords_validation = (data) => {
    for (const db in data) {
      for (const sp in data[db]) {
        const validVariables = data[db][sp].variables_validate === "OK si cumple estándares";
        const validDuplicates = data[db][sp].possible_duplicate_sps === "No se encontraron posibles sp's duplicados";

        if (!validVariables || !validDuplicates) {
          return true; 
        }

        if (data[db][sp].keywords_validate.includes("ALERTA !!..")) {
          return true;
        }
      }
    }
    return false;
  };

  try {
    return keywords_validation(dataDB);
  } catch (error) {
    console.log("No se pudo validar las keywords");
    return false;
  }
}

async function validate_end_job(job_sybase) {
  return job_sybase;
}

async function exec() {
  try {
    let job_sybase;

    if (sybaseData && Object.keys(sybaseData).length > 0) {
      const checkListSybase = await getCheckList(sybaseData, 'http://192.168.55.62:3000/check-list/get-check-list');
      console.log(" ----------------------------------------------------------------------  ");
      console.log(" ----------------------------------------------------------------------  ");
      console.log(" ----------------------------------------------------------------------  ");
      console.log(" ----------------------------------------------------------------------  ");
      console.log("      RESPUESTA SYBASE    ");
      console.log(" ----------------------------------------------------------------------  ");
      console.log(" ----------------------------------------------------------------------  ");
      console.log(" ----------------------------------------------------------------------  ");
      console.log(" ----------------------------------------------------------------------  ");
      console.log(JSON.stringify(checkListSybase, null, 2));
      job_sybase = await content_validate(checkListSybase);
    }

    if (job_sybase) {
      console.log("SYBASE: LOS SPS ANALIZADOS NO CUMPLEN CON LOS ESTANDARES DE DESARROLLO");
    } else {
      console.log("SYBASE: LOS SPS ANALIZADOS CUMPLEN CON LOS ESTANDARES DE DESARROLLO");
    }

    const validate_Exec = await validate_end_job(job_sybase);

    if (validate_Exec) {
      console.error('JOB CANCELED: LOS SPS ANALIZADOS NO CUMPLEN CON LOS ESTANDARES DE DESARROLLO');
      process.exit(1);
    } else {
      console.log('JOB COMPLETED: LOS SPS ANALIZADOS CUMPLEN CON LOS ESTÁNDARES DE DESARROLLO');
      process.exit(0);
    }

  } catch (error) {
    console.error('Error en la ejecución:', error);
    process.exit(1);
  }
}

exec();
