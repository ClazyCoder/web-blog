import Button from 'react-bootstrap/Button';
import Card from 'react-bootstrap/Card';

function ContentCard({ title, text, imgSrc }) {
    return (
        <Card>
            <Card.Img variant="top" src={imgSrc} style={{ height: '100px' }} />
            <Card.Body>
                <Card.Title>{title}</Card.Title>
                <Card.Text>
                    {text}
                </Card.Text>
                <Button variant="primary">Go somewhere</Button>
            </Card.Body>
        </Card>
    );
}

export default ContentCard;