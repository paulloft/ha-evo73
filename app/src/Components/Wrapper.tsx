import type {PropsWithChildren} from 'react';

export default function Wrapper({children}: PropsWithChildren) {
    return (
        <div className="container d-flex min-vh-100 w-100 align-items-center">
            <div className="w-100">{children}</div>
        </div>
    );
}
