import React, { useState } from "react";
import {
  Container,
  TextField,
  Typography,
  MenuItem,
  Box,
  Grid,
  Paper,
  CircularProgress,
  Snackbar,
  Alert,
  useTheme,
  useMediaQuery
} from "@mui/material";
import { useFormik } from "formik";
import * as Yup from "yup";
import axios from "axios";

// Función para validar y formatear RUT
function validaRut(rut) {
  rut = rut.replace(/\./g,'').replace(/-/g, '').toUpperCase();
  if (rut.length < 2) return false;

  const rutNumero = rut.slice(0, -1);
  const dv = rut.slice(-1).toUpperCase();
  if (!/^\d+$/.test(rutNumero)) return false;
  if (!/^[0-9K]$/.test(dv)) return false;

  let suma = 0;
  let multiplicador = 2;

  for (let i = rutNumero.length - 1; i >= 0; i--) {
    suma += parseInt(rutNumero[i]) * multiplicador;
    multiplicador = multiplicador === 7 ? 2 : multiplicador + 1;
  }

  const dvCalculado = 11 - (suma % 11);
  const dvEsperado = dvCalculado === 11 ? '0' : dvCalculado === 10 ? 'K' : dvCalculado.toString();

  return dv === dvEsperado;
}

// Función para formatear RUT
function formatearRut(rut) {
  if (!rut) return '';

  rut = rut.replace(/\./g,'').replace(/-/g, '').toUpperCase();
  if (rut.length < 2) return rut;

  const rutNumero = rut.slice(0, -1);
  const dv = rut.slice(-1);
  let rutFormateado = '';

  for (let i = rutNumero.length; i > 0; i -= 3) {
    rutFormateado = rutNumero.slice(Math.max(0, i-3), i) + (rutFormateado ? '.' + rutFormateado : '');
  }

  return `${rutFormateado}-${dv}`;
}

// API configuration
const API_URL = process.env.REACT_APP_API_URL || 'https://ecqlab.navidadloprado.cl/api/addData';

// Validation schema for the form
const validationSchema = Yup.object().shape({
  parentName: Yup.string()
    .required("El nombre es obligatorio")
    .min(2, "El nombre debe tener al menos 2 caracteres"),

  parentRUT: Yup.string()
    .required("El RUT es obligatorio")
    .matches(/^(\d{1,2}\.\d{3}\.\d{3}-)([0-9K])$/, "Formato de RUT inválido")
    .test("validRut", "RUT inválido", validaRut),

  address: Yup.string()
    .required("La dirección es obligatoria")
    .min(5, "La dirección debe tener al menos 5 caracteres"),

  phone: Yup.string()
    .required("El teléfono es obligatorio")
    .matches(/^[+]?[0-9]{9,12}$/, "Formato de teléfono inválido")
    .max(12, "El teléfono no debe exceder 12 caracteres"),

  email: Yup.string()
    .email("Correo inválido")
    .required("El correo es obligatorio"),

  parentRelationship: Yup.string()
    .required("La relación con el menor es obligatoria"),

  parentDocument: Yup.mixed().when('parentRelationship', {
    is: (val) => val === 'Otro familiar',
    then: () => Yup.mixed()
      .required("Debe adjuntar documento que acredite la relación con el menor")
      .test("fileSize", "El archivo es muy grande", (value) => !value || value.size <= 5000000)
      .test("fileType", "Formato no soportado", (value) => 
        !value || ["application/pdf", "image/jpeg", "image/png"].includes(value.type)
      ),
    otherwise: () => Yup.mixed().notRequired()
  }),

  children: Yup.array().of(
    Yup.object().shape({
      childName: Yup.string()
        .required("Nombre del niño/a es obligatorio")
        .min(2, "El nombre debe tener al menos 2 caracteres"),

      childRUT: Yup.string()
        .required("RUT del niño/a es obligatorio")
        .matches(/^(\d{1,2}\.\d{3}\.\d{3}-)([0-9K])$/, "Formato de RUT inválido")
        .test("validRut", "RUT inválido", validaRut),

      birthDate: Yup.date()
        .required("Fecha de nacimiento es obligatoria")
        .max(new Date(), "La fecha no puede ser futura"),

      gender: Yup.string()
        .required("El género es obligatorio"),

      educationLevel: Yup.string()
        .required("El nivel educacional es obligatorio"),

      school: Yup.string()
        .required("El colegio es obligatorio")
        .min(3, "El nombre del colegio debe tener al menos 3 caracteres"),

      document: Yup.mixed()
        .required("Debe adjuntar un documento")
        .test("fileSize", "El archivo es muy grande", (value) => !value || value.size <= 5000000)
        .test("fileType", "Formato no soportado", (value) => 
          !value || ["application/pdf", "image/jpeg", "image/png"].includes(value.type)
        )
    })
  )
  .min(1, "Debe postular al menos a un niño/a")
  .max(2, "Solo puede postular hasta 2 niños/as")
});

// Initial form values
const initialValues = {
  parentName: "",
  parentRUT: "",
  address: "",
  phone: "",
  parentRelationship: "",
  parentDocument: null,
  email: "",
  children: [
    {
      childName: "",
      childRUT: "",
      birthDate: "",
      gender: "",
      school: "",
      educationLevel: "",
      document: null,
    },
  ],
};

const BecaForm = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const [childrenCount, setChildrenCount] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: "",
    severity: "success"
  });

  const handleCloseSnackbar = () => {
    setSnackbar(prev => ({ ...prev, open: false }));
  };

  const handleSubmit = async (values, { resetForm }) => {
    setIsSubmitting(true);
    console.log('Starting form submission...', values);

    try {
      const formData = new FormData();

      // Add parent data
      Object.keys(values).forEach(key => {
        if (key !== 'children' && key !== 'parentDocument' && values[key]) {
          formData.append(key, values[key]);
        }
      });

      // Add parent document if relationship is "Otro familiar"
      if (values.parentRelationship === "Otro familiar" && values.parentDocument) {
        formData.append('parentDocument', values.parentDocument);
      }

      // Add number of children
      formData.append('nhijos', values.children.length);
      formData.append('childrenCount', values.children.length);

      // Add first child data and document
      if (values.children[0]) {
        formData.append('child0', JSON.stringify({
          ...values.children[0],
          document: null
        }));
        if (values.children[0].document) {
          formData.append('document0', values.children[0].document);
        }
      }

      // Add second child data and document if exists
      if (values.children[1]) {
        formData.append('child1', JSON.stringify({
          ...values.children[1],
          document: null
        }));
        if (values.children[1].document) {
          formData.append('document1', values.children[1].document);
        }
      }

      const response = await axios.post(API_URL, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        },
        withCredentials: true
      });

      console.log('Success:', response);
      setSnackbar({
        open: true,
        message: "¡Formulario enviado exitosamente! Te contactaremos pronto.",
        severity: "success"
      });
      resetForm();
      setChildrenCount(1);

    } catch (error) {
      console.error('Error:', error);
      setSnackbar({
        open: true,
        message: error.response?.data?.error || "Hubo un error al enviar el formulario. Por favor intenta nuevamente.",
        severity: "error"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const formik = useFormik({
    initialValues,
    validationSchema,
    onSubmit: handleSubmit,
  });

  const handleChildrenChange = (event) => {
    const count = parseInt(event.target.value, 10);
    setChildrenCount(count);
  
    const newChildren = Array.from({ length: count }, (_, index) =>
      formik.values.children[index] || {
        childName: "",
        childRUT: "",
        birthDate: "",
        gender: "",
        school: "",
        educationLevel: "",
        document: null,
      }
    );
  
    formik.setFieldValue("children", newChildren);
  };

  const handleFileUpload = (index) => (event) => {
    const file = event.currentTarget.files[0];
    if (!file) return;

    const isValidSize = file.size <= 5000000;
    const isValidType = ["application/pdf", "image/jpeg", "image/png"].includes(file.type);

    if (!isValidSize || !isValidType) {
      setSnackbar({
        open: true,
        message: !isValidSize
          ? "El archivo no debe superar los 5MB"
          : "Solo se permiten archivos PDF, JPEG o PNG",
        severity: "error"
      });
      return;
    }

    formik.setFieldValue(`children.${index}.document`, file);
  };

  const handleParentDocumentUpload = (event) => {
    const file = event.currentTarget.files[0];
    if (!file) return;

    const isValidSize = file.size <= 5000000;
    const isValidType = ["application/pdf", "image/jpeg", "image/png"].includes(file.type);

    if (!isValidSize || !isValidType) {
      setSnackbar({
        open: true,
        message: !isValidSize
          ? "El archivo no debe superar los 5MB"
          : "Solo se permiten archivos PDF, JPEG o PNG",
        severity: "error"
      });
      return;
    }

    formik.setFieldValue('parentDocument', file);
  };

  const handleRutChange = (field) => (event) => {
    const value = event.target.value;
    const formattedValue = formatearRut(value);
    formik.setFieldValue(field, formattedValue);
  };

  return (
    <Container maxWidth="lg" sx={{ 
      py: isMobile ? 1 : 4,
      px: isMobile ? 1 : 3,
      background: 'linear-gradient(135deg, #f5f7fa 0%, #ffffff 100%)',
      minHeight: '95vh',
      borderRadius: '20px', 
      maxWidth: '900px'
    }}>
      <Paper 
        elevation={6} 
        sx={{ 
          p: isMobile ? 2 : 6,
          mb: isMobile ? 3 : 6,
          borderRadius: 4,
          bgcolor: '#fff',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
          transition: 'transform 0.3s ease-in-out, box-shadow 0.3s ease-in-out',
          '&:hover': {
            transform: 'translateY(-4px)',
            boxShadow: '0 12px 48px rgba(0, 0, 0, 0.15)'
          }
        }}
      >
        <Box sx={{ textAlign: 'center', maxWidth: '800px', mx: 'auto' }}>
          <img 
            src="/images/BannerFormulario.png" 
            alt="Banner Beca Municipal"
            style={{ 
              width: '100%',
              height: 'auto',
              marginBottom: isMobile ? '1.5rem' : '3rem',
              borderRadius: '12px',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
              transition: 'transform 0.3s ease-in-out',
              '&:hover': {
                transform: 'scale(1.02)'
              }
            }}
          />
          
          <Typography 
            variant={isMobile ? "h6" : "h4"} 
            sx={{ 
              color: '#1a73e8',
              fontWeight: 700,
              mb: isMobile ? 1.5 : 2,
              textTransform: 'uppercase',
              letterSpacing: '1px',
              fontSize: isMobile ? '1.2rem' : undefined,
              textShadow: '2px 2px 4px rgba(26, 115, 232, 0.1)',
              transition: 'color 0.3s ease',
              '&:hover': {
                color: '#1557b0'
              }
            }}
          >
            Beca Municipal Apoyo Escolar 2025
          </Typography>

          <Typography 
            variant={isMobile ? "subtitle1" : "h6"}
            sx={{ 
              color: '#2c3e50',
              mb: isMobile ? 2 : 3,
              fontWeight: 600,
              fontSize: isMobile ? '1rem' : undefined,
              letterSpacing: '0.5px',
              transition: 'color 0.3s ease',
              '&:hover': {
                color: '#34495e'
              }
            }}
          >
            Municipalidad de Lo Prado
          </Typography>

          <Typography 
            variant="body1" 
            sx={{ 
              mb: isMobile ? 2 : 4,
              color: '#34495e',
              textAlign: 'left', 
              lineHeight: 1.6,
              fontWeight: 400,
              px: isMobile ? 1 : 2,
              fontSize: isMobile ? '0.85rem' : '0.95rem',
              letterSpacing: '0.3px',
              transition: 'color 0.3s ease',
              '&:hover': {
                color: '#2c3e50'
              }
            }}
          >
            La Municipalidad de Lo Prado ha iniciado el proceso de postulación a la Beca de Apoyo Escolar, Lo
            Prado 2025, que busca brindar apoyo a la educación de niños, niñas y adolescentes de la comuna
            a través de un aporte económico de $30.000 (gift card) que les permita solventar la compra de
            útiles o uniforme escolar para el año académico en curso.
          </Typography>

          <Grid container spacing={isMobile ? 3 : 6}>
            <Grid item xs={12} md={6}>
              <Box sx={{ 
                textAlign: 'left',
                p: isMobile ? 1.5 : 2,
                bgcolor: '#f8faff',
                borderRadius: 3,
                boxShadow: '0 4px 16px rgba(26, 115, 232, 0.1)',
                transition: 'all 0.3s ease',
                '&:hover': {
                  transform: 'translateY(-4px)',
                  boxShadow: '0 6px 20px rgba(26, 115, 232, 0.15)',
                  bgcolor: '#f0f4ff'
                }
              }}>
                <Typography 
                  variant={isMobile ? "subtitle1" : "h6"}
                  sx={{ 
                    color: '#1a73e8',
                    mb: isMobile ? 2 : 3,
                    fontWeight: 700,
                    fontSize: isMobile ? '1.1rem' : undefined,
                    letterSpacing: '0.5px',
                    transition: 'color 0.3s ease',
                    '&:hover': {
                      color: '#1557b0'
                    }
                  }}
                >
                  Requisitos para postular:
                </Typography>
                
                <ul style={{ 
                  paddingLeft: isMobile ? '12px' : '20px',
                  color: '#34495e',
                  listStyleType: 'none',
                  fontSize: isMobile ? '0.9rem' : '1rem'
                }}>
                  {[
                    "Niños/as o adolescentes menores de 18 años.",
                    "El/la estudiante como el adulto que lo postula deben vivir en Lo Prado y contar con Registro Social de Hogares (RSH) igual o menor a 70%",
                    "Comprobar ser alumno regular de enseñanza básica o media en colegios acreditados por el Ministerio de Educación.",
                    "No podrán postular hijos o hijas de funcionarios municipales o autoridades locales"
                  ].map((item, index) => (
                    <li key={index} style={{ 
                      marginBottom: isMobile ? '12px' : '16px',
                      display: 'flex',
                      alignItems: 'flex-start',
                      transition: 'transform 0.2s ease, color 0.3s ease',
                      '&:hover': {
                        transform: 'translateX(4px)',
                        color: '#1a73e8'
                      }
                    }}>
                      <span style={{ 
                        color: '#1a73e8',
                        marginRight: '12px',
                        fontWeight: 'bold',
                        fontSize: '1.1em',
                        transition: 'transform 0.2s ease',
                        '&:hover': {
                          transform: 'scale(1.1)'
                        }
                      }}>•</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </Box>
            </Grid>
            <Grid item xs={12} md={6}>
              <Box sx={{ 
                textAlign: 'left',
                height: 'auto',
                p: isMobile ? 1.5 : 2,
                bgcolor: '#f8faff',
                borderRadius: 3,
                boxShadow: '0 3px 12px rgba(26, 115, 232, 0.08)',
                transition: 'all 0.3s ease',
                '&:hover': {
                  transform: 'translateY(-3px)',
                  boxShadow: '0 4px 16px rgba(26, 115, 232, 0.12)',
                  bgcolor: '#f0f4ff'
                }
              }}>
                <Typography 
                  variant={isMobile ? "subtitle1" : "h6"}
                  sx={{ 
                    color: '#1a73e8',
                    mb: isMobile ? 2 : 3,
                    fontWeight: 700,
                    fontSize: isMobile ? '1.1rem' : undefined,
                    letterSpacing: '0.5px',
                    transition: 'color 0.3s ease',
                    '&:hover': {
                      color: '#1557b0'
                    }
                  }}
                >
                  Importante de Leer:
                </Typography>
                
                <ul style={{ 
                  paddingLeft: isMobile ? '12px' : '20px',
                  color: '#34495e',
                  listStyleType: 'none',
                  fontSize: isMobile ? '0.9rem' : '1rem'
                }}>
                  {[
                    "Deberá postular formalmente el padre, madre o adulto/a responsable legal del cuidado personal del niñ@.",
                    "Cada familia podrá postular a un máximo de dos estudiantes por hogar (según RSH).",
                    "La selección final de beneficiarios será a través de un riguroso análisis técnico que contempla la evaluación de los antecedentes sociales."
                  ].map((item, index) => (
                    <li key={index} style={{ 
                      marginBottom: isMobile ? '12px' : '16px',
                      display: 'flex',
                      alignItems: 'flex-start',
                      transition: 'transform 0.2s ease, color 0.3s ease',
                      '&:hover': {
                        transform: 'translateX(4px)',
                        color: '#1a73e8'
                      }
                    }}>
                      <span style={{ 
                        color: '#1a73e8',
                        marginRight: '12px',
                        fontWeight: 'bold',
                        fontSize: '1.1em',
                        transition: 'transform 0.2s ease',
                        '&:hover': {
                          transform: 'scale(1.1)'
                        }
                      }}>•</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </Box>
            </Grid>
          </Grid>

          <Box sx={{ 
            mt: isMobile ? 3 : 6,
            p: isMobile ? 2 : 4,
            bgcolor: '#e8f0fe',
            borderRadius: 3,
            boxShadow: '0 4px 16px rgba(26, 115, 232, 0.1)',
            transition: 'all 0.3s ease',
            '&:hover': {
              transform: 'translateY(-4px)',
              boxShadow: '0 6px 20px rgba(26, 115, 232, 0.15)',
              bgcolor: '#e3ebfd'
            }
          }}>
            <Typography 
              sx={{ 
                color: '#1a73e8',
                fontWeight: 700,
                mb: isMobile ? 2 : 3,
                fontSize: isMobile ? '1rem' : '1.2rem',
                letterSpacing: '0.5px',
                transition: 'color 0.3s ease',
                '&:hover': {
                  color: '#1557b0'
                }
              }}
            >
              Resultados se informarán en el mes de febrero 2025
            </Typography>

            <Typography 
              sx={{ 
                color: '#34495e',
                mb: isMobile ? 2 : 3,
                fontSize: isMobile ? '0.9rem' : '1rem',
                letterSpacing: '0.3px',
                transition: 'color 0.3s ease',
                '&:hover': {
                  color: '#2c3e50'
                }
              }}
            >
              * Consultas: Oficina de Niñez Lo Prado - ninezyjuventudtemprana@loprado.cl
            </Typography>

            <Typography 
              sx={{ 
                color: '#1a73e8',
                fontWeight: 700,
                fontSize: isMobile ? '1rem' : '1.2rem',
                letterSpacing: '0.5px',
                transition: 'color 0.3s ease',
                '&:hover': {
                  color: '#1557b0'
                }
              }}
            >
              La postulación es exclusivamente a través de este formulario
            </Typography>
          </Box>
        </Box>
      </Paper>

      <Paper 
        elevation={6} 
        sx={{ 
          p: isMobile ? 2 : 6,
          borderRadius: 4,
          bgcolor: '#fff',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
          transition: 'transform 0.3s ease-in-out, box-shadow 0.3s ease-in-out',
          '&:hover': {
            transform: 'translateY(-4px)',
            boxShadow: '0 12px 48px rgba(0, 0, 0, 0.15)'
          }
        }}
      >
        <form onSubmit={formik.handleSubmit} encType="multipart/form-data">
          <Box mb={isMobile ? 4 : 6}>
            <Typography
              variant={isMobile ? 'subtitle1' : 'h6'}
              sx={{
                color: '#1a73e8',
                mb: isMobile ? 3 : 4,
                fontWeight: 700,
                borderBottom: '2px solid #1a73e8',
                paddingBottom: '12px',
                fontSize: isMobile ? '1.1rem' : undefined,
                letterSpacing: '0.5px',
                textTransform: 'uppercase',
                transition: 'color 0.3s ease, border-bottom-color 0.3s ease',
                '&:hover': {
                  color: '#1557b0',
                  borderBottomColor: '#1557b0'
                }
              }}
            >
              A) Datos del adulto responsable
            </Typography>

            <Grid container spacing={isMobile ? 2 : 4}>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  id="parentName"
                  name="parentName"
                  label="Nombre Completo"
                  value={formik.values.parentName}
                  onChange={formik.handleChange}
                  error={formik.touched.parentName && Boolean(formik.errors.parentName)}
                  helperText={formik.touched.parentName && formik.errors.parentName}
                  variant="outlined"
                  placeholder="Ej: Juan Alberto Pérez González"
                  size={isMobile ? 'small' : 'medium'}
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      transition: 'all 0.3s ease',
                      '&:hover fieldset': {
                        borderColor: '#1a73e8',
                        borderWidth: '2px'
                      },
                      '&.Mui-focused fieldset': {
                        borderColor: '#1a73e8',
                        borderWidth: '2px'
                      },
                    },
                    '& label.Mui-focused': {
                      color: '#1a73e8',
                    },
                    '& .MuiInputBase-input': {
                      transition: 'background-color 0.3s ease',
                      '&:hover': {
                        backgroundColor: '#f8faff'
                      }
                    }
                  }}
                />
              </Grid>

              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  id="parentRUT"
                  name="parentRUT"
                  label="RUT"
                  value={formik.values.parentRUT}
                  onChange={handleRutChange('parentRUT')}
                  error={formik.touched.parentRUT && Boolean(formik.errors.parentRUT)}
                  helperText={formik.touched.parentRUT && formik.errors.parentRUT}
                  variant="outlined"
                  placeholder="Ej: 12.345.678-9"
                  inputProps={{
                    maxLength: 12,
                  }}
                  size={isMobile ? 'small' : 'medium'}
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      transition: 'all 0.3s ease',
                      '&:hover fieldset': {
                        borderColor: '#1a73e8',
                        borderWidth: '2px'
                      },
                      '&.Mui-focused fieldset': {
                        borderColor: '#1a73e8',
                        borderWidth: '2px'
                      },
                    },
                    '& label.Mui-focused': {
                      color: '#1a73e8',
                    },
                    '& .MuiInputBase-input': {
                      transition: 'background-color 0.3s ease',
                      '&:hover': {
                        backgroundColor: '#f8faff'
                      }
                    }
                  }}
                />
              </Grid>

              <Grid item xs={12}>
                <TextField
                  fullWidth
                  id="address"
                  name="address"
                  label="Dirección"
                  value={formik.values.address}
                  onChange={formik.handleChange}
                  error={formik.touched.address && Boolean(formik.errors.address)}
                  helperText={formik.touched.address && formik.errors.address}
                  variant="outlined"
                  placeholder="Ej: Av. San Pablo 6500, Lo Prado"
                  size={isMobile ? 'small' : 'medium'}
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      transition: 'all 0.3s ease',
                      '&:hover fieldset': {
                        borderColor: '#1a73e8',
                        borderWidth: '2px'
                      },
                      '&.Mui-focused fieldset': {
                        borderColor: '#1a73e8',
                        borderWidth: '2px'
                      },
                    },
                    '& label.Mui-focused': {
                      color: '#1a73e8',
                    },
                    '& .MuiInputBase-input': {
                      transition: 'background-color 0.3s ease',
                      '&:hover': {
                        backgroundColor: '#f8faff'
                      }
                    }
                  }}
                />
              </Grid>

              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  id="phone"
                  name="phone"
                  label="Teléfono"
                  value={formik.values.phone}
                  onChange={formik.handleChange}
                  error={formik.touched.phone && Boolean(formik.errors.phone)}
                  helperText={formik.touched.phone && formik.errors.phone}
                  variant="outlined"
                  placeholder="Ej: 912345678"
                  inputProps={{
                    maxLength: 9,
                  }}
                  size={isMobile ? 'small' : 'medium'}
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      transition: 'all 0.3s ease',
                      '&:hover fieldset': {
                        borderColor: '#1a73e8',
                        borderWidth: '2px'
                      },
                      '&.Mui-focused fieldset': {
                        borderColor: '#1a73e8',
                        borderWidth: '2px'
                      },
                    },
                    '& label.Mui-focused': {
                      color: '#1a73e8',
                    },
                    '& .MuiInputBase-input': {
                      transition: 'background-color 0.3s ease',
                      '&:hover': {
                        backgroundColor: '#f8faff'
                      }
                    }
                  }}
                />
              </Grid>

              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  id="email"
                  name="email"
                  label="Correo Electrónico"
                  value={formik.values.email}
                  onChange={formik.handleChange}
                  error={formik.touched.email && Boolean(formik.errors.email)}
                  helperText={formik.touched.email && formik.errors.email}
                  variant="outlined"
                  type="email"
                  placeholder="ejemplo@correo.com"
                  size={isMobile ? 'small' : 'medium'}
                />
              </Grid>
            </Grid>

            <Typography
              sx={{ mt: 2, mb: 1, color: '#1a73e8', fontWeight: 600 }}
            >
              Relación con el menor:
            </Typography>
            <TextField
              select
              fullWidth
              id="parentRelationship"
              name="parentRelationship"
              value={formik.values.parentRelationship}
              onChange={formik.handleChange}
              error={formik.touched.parentRelationship && Boolean(formik.errors.parentRelationship)}
              helperText={formik.touched.parentRelationship && formik.errors.parentRelationship}
              size={isMobile ? 'small' : 'medium'}
              placeholder="Seleccione una opción"
              SelectProps={{
                displayEmpty: true,
                renderValue: (value) => value || "Seleccione una opción"
              }}
            >
              <MenuItem value="">Seleccione una opción</MenuItem>
              <MenuItem value="Padre">Padre</MenuItem>
              <MenuItem value="Madre">Madre</MenuItem>
              <MenuItem value="Otro familiar">Otro familiar</MenuItem>
            </TextField>

            {formik.values.parentRelationship === "Otro familiar" && (
              <Box sx={{ mt: 2 }}>
                <Typography variant="body2" sx={{ mb: 1, color: 'text.secondary' }}>
                  Documento que acredite el cuidado personal del menor (emitido por tribunales)
                </Typography>
                <TextField
                  fullWidth
                  type="file"
                  onChange={handleParentDocumentUpload}
                  error={formik.touched.parentDocument && Boolean(formik.errors.parentDocument)}
                  helperText={formik.touched.parentDocument && formik.errors.parentDocument}
                  size={isMobile ? 'small' : 'medium'}
                />
              </Box>
            )}
          </Box>

          <Typography
            variant={isMobile ? 'subtitle1' : 'h6'}
            sx={{
              color: '#1a73e8',
              mb: isMobile ? 3 : 4,
              fontWeight: 700,
              borderBottom: '2px solid #1a73e8',
              paddingBottom: '12px',
              fontSize: isMobile ? '1.1rem' : undefined,
              letterSpacing: '0.5px',
              textTransform: 'uppercase',
              transition: 'color 0.3s ease, border-bottom-color 0.3s ease',
              '&:hover': {
                color: '#1557b0',
                borderBottomColor: '#1557b0'
              }
            }}
          >
            B) Datos de los niños a postular
          </Typography>

          <Typography
            sx={{ mt: 2, mb: 1, color: '#1a73e8', fontWeight: 600 }}
          >
            Número de niños a postular:
          </Typography>
          <TextField
            select
            fullWidth
            value={childrenCount}
            onChange={(e) => {
              handleChildrenChange(e);
              formik.setFieldValue("childrencount", e.target.value);
            }}
            size={isMobile ? 'small' : 'medium'}
          >
            <MenuItem value={1}>1 niño</MenuItem>
            <MenuItem value={2}>2 niños</MenuItem>
          </TextField>

          {formik.values.children.map((child, index) => (
            <Box key={index} sx={{ mt: 4 }}>
              <Typography variant="h6" sx={{ color: '#1a73e8', mb: 2 }}>
                Datos del niño/a {index + 1}
              </Typography>
              
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    name={`children.${index}.childName`}
                    label="Nombre Completo"
                    value={formik.values.children[index].childName}
                    onChange={formik.handleChange}
                    error={
                      formik.touched.children?.[index]?.childName &&
                      Boolean(formik.errors.children?.[index]?.childName)
                    }
                    helperText={
                      formik.touched.children?.[index]?.childName &&
                      formik.errors.children?.[index]?.childName
                    }
                    size={isMobile ? 'small' : 'medium'}
                  />
                </Grid>

                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    name={`children.${index}.childRUT`}
                    label="RUT"
                    value={formik.values.children[index].childRUT}
                    onChange={(e) => handleRutChange(`children.${index}.childRUT`)(e)}
                    error={
                      formik.touched.children?.[index]?.childRUT &&
                      Boolean(formik.errors.children?.[index]?.childRUT)
                    }
                    helperText={
                      formik.touched.children?.[index]?.childRUT &&
                      formik.errors.children?.[index]?.childRUT
                    }
                    inputProps={{
                      maxLength: 12,
                    }}
                    placeholder="Ej: 12.345.678-9"
                    size={isMobile ? 'small' : 'medium'}
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        transition: 'all 0.3s ease',
                        '&:hover fieldset': {
                          borderColor: '#1a73e8',
                          borderWidth: '2px'
                        },
                        '&.Mui-focused fieldset': {
                          borderColor: '#1a73e8',
                          borderWidth: '2px'
                        },
                      },
                      '& label.Mui-focused': {
                        color: '#1a73e8',
                      }
                    }}
                  />
                </Grid>

                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    name={`children.${index}.birthDate`}
                    label="Fecha de Nacimiento"
                    type="date"
                    value={formik.values.children[index].birthDate}
                    onChange={formik.handleChange}
                    InputLabelProps={{ shrink: true }}
                    error={
                      formik.touched.children?.[index]?.birthDate &&
                      Boolean(formik.errors.children?.[index]?.birthDate)
                    }
                    helperText={
                      formik.touched.children?.[index]?.birthDate &&
                      formik.errors.children?.[index]?.birthDate
                    }
                    size={isMobile ? 'small' : 'medium'}
                  />
                </Grid>

                <Grid item xs={12} sm={6}>
                  <TextField
                    select
                    fullWidth
                    name={`children.${index}.gender`}
                    label="Género"
                    value={formik.values.children[index].gender}
                    onChange={formik.handleChange}
                    error={
                      formik.touched.children?.[index]?.gender &&
                      Boolean(formik.errors.children?.[index]?.gender)
                    }
                    helperText={
                      formik.touched.children?.[index]?.gender &&
                      formik.errors.children?.[index]?.gender
                    }
                    size={isMobile ? 'small' : 'medium'}
                  >
                    <MenuItem value="Femenino">Femenino</MenuItem>
                    <MenuItem value="Masculino">Masculino</MenuItem>
                    <MenuItem value="Otro">Otro</MenuItem>
                  </TextField>
                </Grid>

                <Grid item xs={12} sm={6}>
                  <TextField
                    select
                    fullWidth
                    name={`children.${index}.educationLevel`}
                    label="Nivel Educacional 2025"
                    value={formik.values.children[index].educationLevel}
                    onChange={formik.handleChange}
                    error={
                      formik.touched.children?.[index]?.educationLevel &&
                      Boolean(formik.errors.children?.[index]?.educationLevel)
                    }
                    helperText={
                      formik.touched.children?.[index]?.educationLevel &&
                      formik.errors.children?.[index]?.educationLevel
                    }
                    size={isMobile ? 'small' : 'medium'}
                  >
                    <MenuItem value="" disabled>Seleccione nivel</MenuItem>
                    <MenuItem value="Educación General Básica" disabled>Educación General Básica</MenuItem>
                    <MenuItem value="1° básico">1° básico</MenuItem>
                    <MenuItem value="2° básico">2° básico</MenuItem>
                    <MenuItem value="3° básico">3° básico</MenuItem>
                    <MenuItem value="4° básico">4° básico</MenuItem>
                    <MenuItem value="5° básico">5° básico</MenuItem>
                    <MenuItem value="6° básico">6° básico</MenuItem>
                    <MenuItem value="7° básico">7° básico</MenuItem>
                    <MenuItem value="8° básico">8° básico</MenuItem>
                    <MenuItem value="Educación General Media" disabled>Educación General Media</MenuItem>
                    <MenuItem value="1° medio">1° medio</MenuItem>
                    <MenuItem value="2° medio">2° medio</MenuItem>
                    <MenuItem value="3° medio">3° medio</MenuItem>
                    <MenuItem value="4° medio">4° medio</MenuItem>
                  </TextField>
                </Grid>

                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    name={`children.${index}.school`}
                    label="Nombre y Comuna del Colegio 2025"
                    value={formik.values.children[index].school}
                    onChange={formik.handleChange}
                    error={
                      formik.touched.children?.[index]?.school &&
                      Boolean(formik.errors.children?.[index]?.school)
                    }
                    helperText={
                      formik.touched.children?.[index]?.school &&
                      formik.errors.children?.[index]?.school
                    }
                    size={isMobile ? 'small' : 'medium'}
                  />
                </Grid>

                <Grid item xs={12}>
                  <Typography variant="body2" sx={{ mb: 1, color: 'text.secondary' }}>
                    Documento Estudiantil (comprobante de matrícula 2025, certificado de estudios 2024, etc.)
                  </Typography>
                  <TextField
                    fullWidth
                    name={`children.${index}.document`}
                    type="file"
                    onChange={(event) => handleFileUpload(index)(event)}
                    error={
                      formik.touched.children?.[index]?.document &&
                      Boolean(formik.errors.children?.[index]?.document)
                    }
                    helperText={
                      formik.touched.children?.[index]?.document &&
                      formik.errors.children?.[index]?.document
                    }
                    size={isMobile ? 'small' : 'medium'}
                  />
                </Grid>
              </Grid>
            </Box>
          ))}

          <Box
            component="button"
            type="submit"
            disabled={isSubmitting}
            sx={{
              width: '100%',
              p: 3,
              bgcolor: '#1a73e8',
              color: '#fff',
              border: 'none',
              borderRadius: 3,
              fontSize: '1.2rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.3s ease',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
              '&:hover': {
                bgcolor: '#1557b0',
                transform: 'translateY(-2px)',
                boxShadow: '0 4px 8px rgba(0,0,0,0.2)'
              },
              '&:active': {
                transform: 'translateY(0)',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
              },
              '&:disabled': {
                bgcolor: '#e0e0e0',
                cursor: 'not-allowed',
                transform: 'none',
                boxShadow: 'none'
              }
            }}
          >
            {isSubmitting ? (
              <CircularProgress size={24} color="inherit" />
            ) : (
              'Enviar Postulación'
            )}
          </Box>
        </form>
      </Paper>

      <Snackbar 
        open={snackbar.open} 
        autoHideDuration={6000} 
        onClose={handleCloseSnackbar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert 
          onClose={handleCloseSnackbar} 
          severity={snackbar.severity}
          sx={{ width: '100%' }}
        >
          {snackbar.severity === "success" ? (
            <>
              Muchas gracias por tu respuesta.<br/>
              En caso de ser seleccionado/a tomaremos contacto contigo prontamente.<br/>
              Los resultados serán publicados en la página www.loprado.cl durante el mes de febrero 2025.<br/>
              <Box sx={{ mt: 2 }}>
                <a 
                  href="https://loprado.cl/"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    padding: '8px 16px',
                    backgroundColor: '#1a73e8',
                    color: '#fff',
                    textDecoration: 'none',
                    borderRadius: '4px',
                    fontWeight: 500
                  }}
                >
                  Ir a loprado.cl
                </a>
              </Box>
            </>
          ) : (
            snackbar.message
          )}
        </Alert>
      </Snackbar>
    </Container>
  );
};

export default BecaForm;
