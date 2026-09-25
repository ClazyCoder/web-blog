import React from 'react';
import { PageLayout } from '../layouts';
import { useParams } from 'react-router-dom';

const PageRoute: React.FC = () => {
    const { id } = useParams();
    return (
        <div>
            <PageLayout key={id} />
        </div>
    );
};

export default PageRoute;
