export const colors = {
  // Primary colors
  primary: '#2E86AB',
  primaryDark: '#1B4F72',
  primaryLight: '#85C1E9',
  
  // Emergency colors
  emergency: '#E74C3C',
  emergencyDark: '#C0392B',
  emergencyLight: '#F1948A',
  
  // Success colors
  success: '#27AE60',
  successDark: '#1E8449',
  
  // Neutral colors
  white: '#FFFFFF',
  black: '#2C3E50',
  gray: '#7F8C8D',
  lightGray: '#BDC3C7',
  
  // Background colors
  background: '#F8F9FA',
  surface: '#FFFFFF',
  
  // Text colors
  textPrimary: '#2C3E50',
  textSecondary: '#7F8C8D',
  textLight: '#BDC3C7',
  
  // Border colors
  border: '#E5E7EB',
  borderLight: '#F3F4F6',
};

export const gradients = {
  primary: ['#2E86AB', '#1B4F72'],
  emergency: ['#E74C3C', '#C0392B'],
  background: ['#F8F9FA', '#E9ECEF'],
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const borderRadius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
};

export const typography = {
  h1: {
    fontSize: 32,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  h2: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  h3: {
    fontSize: 24,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  h4: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  body: {
    fontSize: 16,
    color: colors.textPrimary,
  },
  bodySmall: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  caption: {
    fontSize: 12,
    color: colors.textSecondary,
  },
};

export const shadows = {
  sm: {
    shadowColor: colors.black,
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  md: {
    shadowColor: colors.black,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  lg: {
    shadowColor: colors.black,
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
};
