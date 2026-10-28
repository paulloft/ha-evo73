import { Outlet } from 'react-router-dom';
import Wrapper from 'app/Components/Wrapper';

export default function Layout() {
  return (<Wrapper><Outlet/></Wrapper>);
}
