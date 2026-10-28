import { isRouteErrorResponse, useRouteError } from 'react-router-dom';
import { errorMessage } from 'app/Utils';
import Wrapper from 'app/Components/Wrapper';

export default function RouteError() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error) ? `${error.status}: ${error.statusText}` : errorMessage(error);
  return <Wrapper><div className="alert alert-danger" role="alert">{message}</div><a href="#/auth">Перейти к авторизации</a></Wrapper>;
}
