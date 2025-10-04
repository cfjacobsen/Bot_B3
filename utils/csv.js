function parseCsv(content) {
  const lines = content.split(/?
/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    return [];
  }

  const headers = lines.shift().split(',').map((header) => header.trim());

  return lines.map((line) => {
    const values = line.split(',').map((value) => value.trim());
    const record = {};

    headers.forEach((header, index) => {
      const rawValue = index < values.length ? values[index] : '';
      const numericValue = Number(rawValue);
      record[header] = rawValue !== '' && !Number.isNaN(numericValue) ? numericValue : rawValue;
    });

    return record;
  });
}

module.exports = {
  parseCsv,
};
