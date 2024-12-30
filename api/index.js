const express = require('express');
const bodyParser = require('body-parser');
const { google } = require('googleapis');
const cors = require('cors');
const dotenv = require('dotenv');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
try {
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true, mode: 0o755 });
  }
} catch (err) {
  console.error('Error creating uploads directory:', err);
  process.exit(1);
}

console.log('Iniciando inicialización del servidor...');

dotenv.config();
console.log('Variables de entorno cargadas');

console.log('Verificando variables de entorno:');
console.log('SPREADSHEET_ID existe:', !!process.env.GOOGLE_SHEETS_SPREADSHEET_ID);
console.log('CLIENT_EMAIL existe:', !!process.env.GOOGLE_CLOUD_CLIENT_EMAIL);
console.log('PRIVATE_KEY existe:', !!process.env.GOOGLE_CLOUD_PRIVATE_KEY);
console.log('DRIVE_FOLDER_ID existe:', !!process.env.GOOGLE_DRIVE_FOLDER_ID);

const app = express();
const port = process.env.PORT || 3001;
console.log(`Puerto configurado como: ${port}`);

const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/drive.file'
];
console.log('Permisos de API configurados:', SCOPES);

const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;

if (!SPREADSHEET_ID) {
  console.error('GOOGLE_SHEETS_SPREADSHEET_ID no está configurado');
  process.exit(1);
}

console.log('ID de Google Sheets en uso:', SPREADSHEET_ID);

console.log('Inicializando autenticación de Google...');
const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_CLOUD_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_CLOUD_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
  scopes: SCOPES,
});
console.log('Autenticación de Google inicializada');

const sheets = google.sheets({ version: 'v4', auth });
const drive = google.drive({ version: 'v3', auth });
console.log('APIs de Google inicializadas');

const corsOptions = {
  origin: function(origin, callback) {
    const allowedOrigins = ['http://localhost:3000', 'https://se.formularios.loprado.cl', 'https://formulariosloprado.cl'];
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('No permitido por CORS'));
    }
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  preflightContinue: false,
  optionsSuccessStatus: 204
};
console.log('Configuración CORS:', corsOptions);

app.use(cors(corsOptions));

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (corsOptions.origin(origin, () => true)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  next();
});

app.use(bodyParser.json());
console.log('Middleware body parser configurado');

// Configure multer with more robust directory handling and error checking
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Ensure uploads directory exists and has proper permissions
    try {
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true, mode: 0o755 });
      }
      // Verify directory is writable
      fs.accessSync(uploadsDir, fs.constants.W_OK);
      cb(null, uploadsDir);
    } catch (err) {
      console.error('Error with uploads directory:', err);
      cb(new Error('Error accessing uploads directory'));
    }
  },
  filename: function (req, file, cb) {
    // Generate unique filename
    const uniqueFilename = `${Date.now()}-${Math.random().toString(36).substring(7)}-${file.originalname}`;
    cb(null, uniqueFilename);
  }
});

const upload = multer({ 
  storage: storage,
  fileFilter: function (req, file, cb) {
    try {
      // Verify directory exists and is writable
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true, mode: 0o755 });
      }
      fs.accessSync(uploadsDir, fs.constants.W_OK);
      cb(null, true);
    } catch (err) {
      console.error('Error verifying uploads directory:', err);
      cb(new Error('Cannot access uploads directory'));
    }
  }
});
console.log('Middleware de subida de archivos configurado');

const SHEETS = {
  FORMULARIO: 'formulario',
  LOGS: 'logs', 
  FILES: 'files',
};

// Function to get current datetime in Chile timezone
function getCurrentDateTime() {
  const now = new Date();
  const chileTZ = 'America/Santiago';
  const dateFormatter = new Intl.DateTimeFormat('es-CL', {
    timeZone: chileTZ,
    year: 'numeric',
    month: '2-digit', 
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  return dateFormatter.format(now).replace(/(\d+)\/(\d+)\/(\d+)/, '$3-$2-$1');
}

// Function to log data into the logs table
async function logToSheet(status, errorMessage, rawData) {
  try {
    const currentDateTime = getCurrentDateTime();
    const logData = [
      currentDateTime,
      status,
      errorMessage || '',
      JSON.stringify(rawData)
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEETS.LOGS}!A:D`,
      valueInputOption: 'USER_ENTERED',
      resource: {
        values: [logData]
      },
    });
    console.log('Datos de registro escritos exitosamente');
  } catch (error) {
    console.error('Error al escribir registros:', error);
  }
}

// Function to track uploaded files
async function trackFileUpload(filename, fileId, fileLink) {
  try {
    const fileData = [filename, fileId, fileLink];

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEETS.FILES}!A:C`,
      valueInputOption: 'USER_ENTERED',
      resource: {
        values: [fileData]
      },
    });
    console.log('Archivo registrado exitosamente');
  } catch (error) {
    console.error('Error al registrar archivo:', error);
  }
}

async function findFirstEmptyRow(sheetId, range) {
  console.log(`Buscando primera fila vacía en hoja ${sheetId}, rango: ${range}`);
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: range,
    });

    const values = response.data.values || [];
    const firstEmptyRow = values.length + 1;
    console.log(`Primera fila vacía encontrada: ${firstEmptyRow}`);
    return firstEmptyRow;
  } catch (error) {
    console.error('Error al buscar primera fila vacía:', error);
    console.error('Detalles del error:', JSON.stringify(error, null, 2));
    throw error;
  }
}

async function checkForDuplicateRUT(parentRUT, childrenRUTs) {
  try {
    // Get parent RUT column (C), first child RUT column (J), and second child RUT column (R) separately
    const parentRUTsResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEETS.FORMULARIO}!C:C`,
    });

    const firstChildRUTsResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEETS.FORMULARIO}!J:J`,
    });

    const secondChildRUTsResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEETS.FORMULARIO}!R:R`,
    });

    // Combine all RUTs into a single array and remove empty values
    const existingRUTs = [
      ...(parentRUTsResponse.data.values || []).flat(),
      ...(firstChildRUTsResponse.data.values || []).flat(),
      ...(secondChildRUTsResponse.data.values || []).flat()
    ].filter(rut => rut);

    // Check parent RUT
    if (existingRUTs.includes(parentRUT)) {
      throw new Error(`El RUT ${parentRUT} ya está registrado en el sistema`);
    }

    // Check children RUTs
    for (const childRUT of childrenRUTs) {
      if (childRUT && existingRUTs.includes(childRUT)) {
        throw new Error(`El RUT ${childRUT} ya está registrado en el sistema`);
      }
    }
  } catch (error) {
    throw error;
  }
}

async function createDriveFolder(parentName, parentRUT) {
  try {
    const currentDate = getCurrentDateTime().split(' ')[0];
    const folderName = `${parentName} - ${parentRUT} - ${currentDate}`;
    
    const folderMetadata = {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: ['1MK0UN_zdZejW_E-hmrwdE4BfsivSGqTE'] // Using the specified folder ID
    };

    const folder = await drive.files.create({
      resource: folderMetadata,
      fields: 'id'
    });

    return folder.data.id;
  } catch (error) {
    console.error('Error al crear carpeta:', error);
    throw error;
  }
}

async function uploadFileToDrive(file, folderId, customFileName) {
  console.log(`Intentando subir archivo: ${customFileName || file.originalname}`);
  try {
    // Verify file exists and is readable
    try {
      await fs.promises.access(file.path, fs.constants.R_OK);
      console.log(`File verified at path: ${file.path}`);
    } catch (err) {
      console.error(`Error accessing file at ${file.path}:`, err);
      throw new Error(`No se puede acceder al archivo: ${err.message}`);
    }

    // Create read stream with error handling
    let fileStream;
    try {
      fileStream = fs.createReadStream(file.path);
    } catch (err) {
      console.error('Error creating read stream:', err);
      throw new Error('Error al leer el archivo');
    }

    // Add error handler to stream
    fileStream.on('error', (err) => {
      console.error('Stream error:', err);
      throw new Error('Error al procesar el archivo');
    });

    console.log('Stream de archivo creado, subiendo a Drive...');
    const { data } = await drive.files.create({
      media: {
        mimeType: file.mimetype,
        body: fileStream,
      },
      requestBody: {
        name: customFileName || file.originalname,
        parents: [folderId],
      },
      fields: 'id,webViewLink,webContentLink',
    });

    // Clean up temporary file
    try {
      await fs.promises.unlink(file.path);
      console.log('Temporary file deleted successfully');
    } catch (err) {
      console.error('Error al eliminar archivo temporal:', err);
    }

    console.log('Archivo subido exitosamente:', data.id);
    return data;
  } catch (error) {
    console.error('Error al subir archivo a drive:', error);
    console.error('Detalles del error:', JSON.stringify(error, null, 2));
    throw error;
  }
}

app.post('/api/addData', upload.fields([
  { name: 'parentDocument', maxCount: 1 },
  { name: 'document0', maxCount: 1 },
  { name: 'document1', maxCount: 1 }
]), async (req, res) => {
  console.log('Solicitud POST recibida en /api/addData');
  
  try {
    const files = req.files || {};
    const currentDateTime = getCurrentDateTime();
    
    // Check for duplicate RUTs before proceeding
    const childrenRUTs = [];
    const childrenCount = parseInt(req.body.childrenCount) || 0;
    for(let i = 0; i < childrenCount; i++) {
      const child = JSON.parse(req.body[`child${i}`]);
      childrenRUTs.push(child.childRUT);
    }
    await checkForDuplicateRUT(req.body.parentRUT, childrenRUTs);

    const firstEmptyRow = await findFirstEmptyRow(SPREADSHEET_ID, `${SHEETS.FORMULARIO}!A:A`);

    // Create folder for this parent
    const folderId = await createDriveFolder(req.body.parentName, req.body.parentRUT);

    // Process parent document if exists
    let parentDocumentLink = 'No se subió archivo';
    if (files.parentDocument && files.parentDocument[0]) {
      const parentFileName = `${req.body.parentName} - Cuidado Personal`;
      const parentFileData = await uploadFileToDrive(files.parentDocument[0], folderId, parentFileName);
      parentDocumentLink = parentFileData.webViewLink;
      await trackFileUpload(parentFileName, parentFileData.id, parentFileData.webViewLink);
    }

    // Process children data
    const childrenData = [];

    for(let i = 0; i < childrenCount; i++) {
      const child = JSON.parse(req.body[`child${i}`]);
      
      let childDocumentLink = 'No se subió archivo';
      if (files[`document${i}`] && files[`document${i}`][0]) {
        const childFileName = `${child.childName} - Documento Estudiantil`;
        const fileData = await uploadFileToDrive(files[`document${i}`][0], folderId, childFileName);
        childDocumentLink = fileData.webViewLink;
        await trackFileUpload(childFileName, fileData.id, fileData.webViewLink);
      }

      const rowData = Array(25).fill(''); // Initialize array with 25 elements (0 to 24)
      
      rowData[0] = i + 1; // ID (Column A) - Starting from 1 and incrementing
      rowData[1] = req.body.parentName || ''; // Responsable (Column B)
      rowData[2] = req.body.parentRUT || ''; // RUT_Resp (Column C)
      rowData[3] = req.body.address || ''; // Dirección (Column D)
      rowData[4] = req.body.phone || ''; // Teléfono (Column E)
      rowData[5] = req.body.email || ''; // Email (Column F)
      rowData[6] = req.body.childrenCount || ''; // Número de hijos (Column G)
      rowData[7] = parentDocumentLink; // Parent Document Link (Column H)
      rowData[8] = req.body.parentRelationship || ''; // Parent Relationship (Column I)
      
      // Child specific columns
      rowData[9] = child.childName || ''; // Child Name (Column J)
      rowData[10] = child.childRUT || ''; // Child RUT (Column K)
      rowData[11] = child.birthDate || ''; // Birth Date (Column L)
      rowData[12] = child.gender || ''; // Gender (Column M)
      rowData[13] = child.educationLevel || ''; // School (Column N)
      rowData[14] = child.school || ''; // Education Level (Column O)
      rowData[15] = childDocumentLink; // Child Document Link (Column P)
      
      const [date, time] = currentDateTime.split(' ');
      rowData[23] = date; // Date (Column X)
      rowData[24] = time; // Time (Column Y)

      childrenData.push(rowData);
    }

    const range = `${SHEETS.FORMULARIO}!A${firstEmptyRow}:Y${firstEmptyRow + childrenData.length - 1}`;
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: range,
      valueInputOption: 'USER_ENTERED',
      resource: {
        values: childrenData
      },
    });

    await logToSheet('Éxito', null, req.body);
    res.status(200).json({ success: true, message: 'Postulación registrada exitosamente' });
  } catch (error) {
    console.error('Error al procesar la postulación:', error);
    await logToSheet('Error', error.message, req.body);
    res.status(500).json({ success: false, error: error.message || 'Error al procesar la postulación' });
  }
});

app.listen(port, () => {
  console.log(`Servidor ejecutándose en el puerto ${port}`);
  console.log('Inicialización del servidor completada');
});