import React from 'react';
import { ContentCard } from "../components";

interface BoardItem {
    id: string;
    title: string;
    text: string;
    last_updated: string;
    imgSrc: string;
}

const BoardLayout: React.FC = () => {
    const getMockData = (): BoardItem[] => {
        return [
            {
                id: "1",
                title: "리액트 공부",
                text: "리액트에 대한 공부",
                last_updated: "2 hours ago",
                imgSrc: "logo192.png"
            },
            {
                id: "2",
                title: "C 언어정리",
                text: "C언어에 대해 정리",
                last_updated: "2 hours ago",
                imgSrc: "logo192.png"
            },
            {
                id: "3",
                title: "백엔드 조사",
                text: "Express, Django 등등 백엔드 조사",
                last_updated: "2 hours ago",
                imgSrc: "logo192.png"
            },
            {
                id: "4",
                title: "AI 동향파악",
                text: "최신 AI기술 동향 파악",
                last_updated: "2 hours ago",
                imgSrc: "logo192.png"
            }
        ]
    }

    const mockData = getMockData();

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-4">
            {mockData.map((item) => (
                <ContentCard
                    key={item.id}
                    id={item.id}
                    title={item.title}
                    text={item.text}
                    last_updated={item.last_updated}
                    imgSrc={item.imgSrc}
                />
            ))}
        </div>
    );
};

export default BoardLayout;