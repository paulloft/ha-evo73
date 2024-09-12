import React from 'react';
import PropTypes from 'prop-types';
import './styles.scss';

export default function Spinner({
  position = null,
  size = 'sm',
  variant = 'primary',
}) {
  return (
    <div className={position || 'text-center'}>
      <div className={`spinner spinner-${size} spinner-${variant}`} />
    </div>
  );
}

Spinner.propTypes = {
  position: PropTypes.string,
  size: PropTypes.oneOf(['xs', 'sm', 'md', 'lg']),
  variant: PropTypes.oneOf(['primary', 'success', 'danger', 'warning', 'info', 'default']),
};
