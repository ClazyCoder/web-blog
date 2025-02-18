import ListGroup from 'react-bootstrap/ListGroup';
import { ContentCard } from "../components";

function BoardLayout() {
    return (
        <ListGroup variant="flush">
            <ListGroup.Item><ContentCard title="리액트 공부" text="리액트에 대한 공부" imgSrc="logo192.png" /></ListGroup.Item>
            <ListGroup.Item><ContentCard title="C 언어정리" text="C언어에 대해 정리" imgSrc="logo192.png" /></ListGroup.Item>
            <ListGroup.Item><ContentCard title="백엔드 조사" text="Express, Django 등등 백엔드 조사" imgSrc="logo192.png" /></ListGroup.Item>
            <ListGroup.Item><ContentCard title="AI 동향파악" text="최신 AI기술 동향 파악" imgSrc="logo192.png" /></ListGroup.Item>
        </ListGroup>
    );
}

export default BoardLayout;