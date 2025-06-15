import React from 'react';
import Button from 'react-bootstrap/Button';
import Card from 'react-bootstrap/Card';

export interface ContentCardProps {
    title: string;
    text: string;
    last_updated: string;
    imgSrc: string;
}

const ContentCard: React.FC<ContentCardProps> = ({ title, text, last_updated, imgSrc }) => {
    return (
        <Card>
            <Card.Img variant="top" src={imgSrc} style={{ height: '200px' }} />
            <Card.ImgOverlay>
                <Card.Title style={{ fontWeight: 'bold' }}>{title}</Card.Title>
                <Card.Text>
                    {text}
                </Card.Text>
                <Card.Text>Last Updated: {last_updated}</Card.Text>
                <Button variant="primary">Read</Button>
            </Card.ImgOverlay>
        </Card>
    );
};

export default ContentCard; 