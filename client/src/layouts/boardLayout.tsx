import React from 'react';
import { ContentCard } from "../components";

interface BoardItem {
    id: string;
    title: string;
    text: string;
    last_updated: string;
    imgSrc: string;
    tags: string[];
}

const BoardLayout: React.FC = () => {
    const getMockData = (): BoardItem[] => {
        return [
            {
                id: "1",
                title: "리액트 공부",
                text: "리액트에 대한 공부",
                last_updated: "2 hours ago",
                imgSrc: "logo192.png",
                tags: ["React", "Frontend", "JavaScript"]
            },
            {
                id: "2",
                title: "C 언어정리",
                text: "C언어에 대해 정리",
                last_updated: "2 hours ago",
                imgSrc: "logo192.png",
                tags: ["C", "Programming"]
            },
            {
                id: "3",
                title: "백엔드 조사",
                text: "Express, Django 등등 백엔드 조사",
                last_updated: "2 hours ago",
                imgSrc: "logo192.png",
                tags: ["Backend", "Express", "Django"]
            },
            {
                id: "4",
                title: "AI 동향파악",
                text: "최신 AI기술 동향 파악",
                last_updated: "2 hours ago",
                imgSrc: "logo192.png",
                tags: ["AI", "Machine Learning", "Tech"]
            }
        ]
    }

    const data = getMockData();

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
            <div className="container mx-auto px-4">
                <h1 className="text-3xl font-bold mb-6 text-gray-900 dark:text-white">
                    📚 게시글
                </h1>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {data.map((item) => (
                        <ContentCard
                            key={item.id}
                            id={item.id}
                            title={item.title}
                            text={item.text}
                            last_updated={item.last_updated}
                            imgSrc={item.imgSrc}
                            tags={item.tags}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
};

export default BoardLayout;