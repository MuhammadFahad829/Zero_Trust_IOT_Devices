import { motion } from 'framer-motion';

export const cardVariant = {
  hidden: { opacity: 0, y: 30, x: -20, scale: 0.95 },
  visible: {
    opacity: 1,
    y: 0,
    x: 0,
    scale: 1,
    transition: { type: 'spring', stiffness: 110, damping: 18 },
  },
  alert: {
    x: [0, -6, 6, -6, 6, 0],
    scale: [1, 1.02, 0.98, 1.01, 1],
    boxShadow: [
      '0 0 0 rgba(0,0,0,0)',
      '0 8px 30px rgba(239,68,68,0.12)',
      '0 0 0 rgba(0,0,0,0)',
    ],
    transition: { duration: 0.9, repeat: 1 },
  },
};

export const containerVariant = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.2,
    },
  },
};
