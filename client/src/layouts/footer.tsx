import React from 'react';
import Nav from 'react-bootstrap/Nav';

const Footer: React.FC = () => {
    return (
        <footer>
            <Nav className="justify-content-center" data-bs-theme="dark" activeKey="/home">
                <Nav.Item>
                    <Nav.Link href="/">Home</Nav.Link>
                </Nav.Item>
                <Nav.Item>
                    <Nav.Link href="/board">Board</Nav.Link>
                </Nav.Item>
                <Nav.Item>
                    <Nav.Link eventKey="disabled" disabled>Others</Nav.Link>
                </Nav.Item>
            </Nav>
        </footer>
    );
};

export default Footer; 