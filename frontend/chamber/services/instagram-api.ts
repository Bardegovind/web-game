export const connectInstagram = async () => {
    const res = await fetch('/api/integrations/instagram/connect', {
        headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
    });
    const data = await res.json();
    if (data.success && data.url) {
        window.location.href = data.url;
    } else {
        throw new Error(data.message || 'Failed to connect to Instagram');
    }
};

export const getInstagramConnection = async () => {
    const res = await fetch('/api/integrations/instagram', {
        headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
    });
    return res.json();
};

export const disconnectInstagram = async () => {
    const res = await fetch('/api/integrations/instagram', {
        method: 'DELETE',
        headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
    });
    return res.json();
};

export const getReels = async (page = 1, limit = 10) => {
    const res = await fetch(`/api/integrations/instagram/reels?page=${page}&limit=${limit}`, {
        headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
    });
    const data = await res.json();
    if (!data.success) {
        throw new Error(data.message || 'Failed to fetch reels');
    }
    return data.data;
};
