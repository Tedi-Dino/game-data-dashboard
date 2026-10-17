// CSV row/field parsing — split out from csv.js so it can be unit-tested
// without pulling in the Firestore dependency chain.
// Handles quoted fields containing commas and embedded newlines (RFC 4180).

// Parse a single CSV line handling quoted fields with commas
export const parseCSVLine = (line) => {
    const values = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQuotes) {
            if (ch === '"') {
                if (line[i + 1] === '"') {
                    current += '"';
                    i++;
                } else {
                    inQuotes = false;
                }
            } else {
                current += ch;
            }
        } else {
            if (ch === '"') {
                inQuotes = true;
            } else if (ch === ',') {
                values.push(current.trim());
                current = '';
            } else {
                current += ch;
            }
        }
    }
    values.push(current.trim());
    return values;
};

// Split CSV text into rows respecting quoted-field newlines (RFC 4180).
export const splitCSVRows = (text) => {
    const rows = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (inQuotes) {
            current += ch;
            if (ch === '"') {
                if (text[i + 1] === '"') {
                    current += '"';
                    i++;
                } else {
                    inQuotes = false;
                }
            }
        } else {
            if (ch === '"') {
                current += ch;
                inQuotes = true;
            } else if (ch === '\r' && text[i + 1] === '\n') {
                rows.push(current);
                current = '';
                i++;
            } else if (ch === '\n') {
                rows.push(current);
                current = '';
            } else {
                current += ch;
            }
        }
    }
    if (current.length > 0 || rows.length > 0) rows.push(current);
    return rows;
};
