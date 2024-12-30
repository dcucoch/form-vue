import React, { useState } from 'react';
import { FormControl, InputLabel, Select, MenuItem } from '@mui/material';

const DateDropdowns = ({ index, field, form }) => {
  const currentDate = new Date();
  const [day, setDay] = useState('');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');

  const handleDateChange = (newDay, newMonth, newYear) => {
    if (newDay && newMonth && newYear) {
      const date = new Date(newYear, newMonth - 1, newDay);
      form.setFieldValue(`children.${index}.birthDate`, date.toISOString().split('T')[0]);
    }
  };

  const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

  return (
    <FormControl fullWidth margin="normal">
      <p><strong>Fecha de nacimiento</strong></p>
      <div style={{ display: 'flex', flexDirection: 'row', gap: 16 }}>
        <FormControl sx={{ minWidth: 80 }}>
          <InputLabel
            id={`day-label-${index}`}
            sx={{ marginBottom: 1, marginTop: day ? -1 : 0 }}
          >
            Día
          </InputLabel>
          <Select
            labelId={`day-label-${index}`}
            id={`day-${index}`}
            value={day}
            onChange={e => {
              const selectedDay = e.target.value;
              setDay(selectedDay);
              handleDateChange(selectedDay, month, year);
            }}
            displayEmpty
            renderValue={selected => selected || ''}
          >
            <MenuItem value="" disabled>
              <em>Día</em>
            </MenuItem>
            {Array.from({ length: 31 }, (_, i) => (
              <MenuItem key={i + 1} value={i + 1}>
                {i + 1}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl sx={{ minWidth: 80 }}>
          <InputLabel
            id={`month-label-${index}`}
            sx={{ marginBottom: 1, marginTop: month ? -1 : 0 }}
          >
            Mes
          </InputLabel>
          <Select
            labelId={`month-label-${index}`}
            id={`month-${index}`}
            value={month}
            onChange={e => {
              const selectedMonth = e.target.value;
              setMonth(selectedMonth);
              handleDateChange(day, selectedMonth, year);
            }}
            displayEmpty
            renderValue={selected => selected || ''}
          >
            <MenuItem value="" disabled>
              <em>Mes</em>
            </MenuItem>
            {months.map((monthName, i) => (
              <MenuItem key={i} value={i + 1}>
                {monthName}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl sx={{ minWidth: 120 }}>
          <InputLabel
            id={`year-label-${index}`}
            sx={{ marginBottom: 1, marginTop: year ? -1 : 0 }}
          >
            Año
          </InputLabel>
          <Select
            labelId={`year-label-${index}`}
            id={`year-${index}`}
            value={year}
            onChange={e => {
              const selectedYear = e.target.value;
              setYear(selectedYear);
              handleDateChange(day, month, selectedYear);
            }}
            displayEmpty
            renderValue={selected => selected || ''}
          >
            <MenuItem value="" disabled>
              <em>Año</em>
            </MenuItem>
            {Array.from({ length: 18 }, (_, i) => {
              const yearValue = currentDate.getFullYear() - i;
              return (
                <MenuItem key={yearValue} value={yearValue}>
                  {yearValue}
                </MenuItem>
              );
            })}
          </Select>
        </FormControl>
      </div>
      {form.errors?.children?.[index]?.birthDate && form.touched?.children?.[index]?.birthDate && (
        <div style={{ color: 'red' }}>{form.errors.children[index].birthDate}</div>
      )}
    </FormControl>
  );
};

export default DateDropdowns;