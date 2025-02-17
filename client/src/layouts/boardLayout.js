import ListGroup from 'react-bootstrap/ListGroup';
import { ContentCard } from "../components";

function BoardLayout() {
    return (
        <ListGroup variant="flush">
            <ListGroup.Item><ContentCard title="헬로" text="가" /></ListGroup.Item>
            <ListGroup.Item><ContentCard title="우" text="나" /></ListGroup.Item>
            <ListGroup.Item><ContentCard title="리액트" text="다" /></ListGroup.Item>
            <ListGroup.Item><ContentCard title="!" text="라" /></ListGroup.Item>
        </ListGroup>
    );
}

export default BoardLayout;