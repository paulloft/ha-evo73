import './styles.scss';

interface SpinnerProps {
  position?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  variant?: 'primary' | 'success' | 'danger' | 'warning' | 'info' | 'default';
}

export default function Spinner({ position = 'text-center', size = 'sm', variant = 'primary' }: SpinnerProps) {
  return <div className={position} role="status" aria-label="Загрузка"><div className={`spinner spinner-${size} spinner-${variant}`} /></div>;
}
