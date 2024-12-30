import { sheets, SPREADSHEET_ID } from '../../lib/sheets';

export default async function handler(req, res) {
  if (req.method === 'POST') {
    const { values } = req.body;

    try {
      const response = await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: 'formulario!A1', // Ajusta el rango según sea necesario
        valueInputOption: 'USER_ENTERED',
        resource: {
          values: [values],
        },
      });

      res.status(200).json({ success: true, data: response.data });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  } else {
    res.status(405).json({ success: false, message: 'Method not allowed' });
  }
}
