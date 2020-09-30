import React, { useState, useEffect, FC, useCallback, useMemo } from 'react';

import { Notifications } from '../../app/notifications/client';
import { OmnichannelContext, OmnichannelContextValue, OmnichannelAgent, OmichannelRoutingConfig } from '../contexts/OmnichannelContext';
import { useReactiveValue } from '../hooks/useReactiveValue';
import { useUser, useUserId } from '../contexts/UserContext';
import { useMethodData } from '../contexts/ServerContext';
import { usePermission, useRole } from '../contexts/AuthorizationContext';
import { useSetting } from '../contexts/SettingsContext';
import { LivechatInquiry } from '../../app/livechat/client/collections/LivechatInquiry';
import { initializeLivechatInquiryStream } from '../../app/livechat/client/lib/stream/queueManager';

const args = [] as any;

const emptyContext = {
	queuedInquiries: [],
	enabled: false,
	agentAvailable: false,
	showOmnichannelQueueLink: false,
} as OmnichannelContextValue;


const useOmnichannelInquiries = (): Array<any> => {
	const uid = useUserId();
	const isOmnichannelManger = useRole('livechat-manager');
	const omnichannelPoolMaxIncoming = useSetting('Livechat_guest_pool_max_number_incoming_livechats_displayed') as number;
	useEffect(() => {
		let cleanup: undefined | (() => void);

		(async () => {
			cleanup = await initializeLivechatInquiryStream(uid, isOmnichannelManger);
			Notifications.onUser('departmentAgentData', async () => {
				cleanup && cleanup();
				cleanup = await initializeLivechatInquiryStream(uid, isOmnichannelManger);
			});
		})();

		return () => {
			Notifications.unUser('departmentAgentData');
			cleanup && cleanup();
		};
	}, [isOmnichannelManger, uid]);

	return useReactiveValue(useCallback(() => LivechatInquiry.find({
		status: 'queued',
	}, {
		sort: {
			queueOrder: 1,
			estimatedWaitingTimeQueue: 1,
			estimatedServiceTimeAt: 1,
		},
		limit: omnichannelPoolMaxIncoming,
	}).fetch(), [omnichannelPoolMaxIncoming]));
};

const OmnichannelDisabledProvider: FC = ({ children }) => <OmnichannelContext.Provider value={emptyContext} children={children}/>;

const OmnichannelManualSelectionProvider: FC<{ value: OmnichannelContextValue }> = ({ value, children }) => {
	const queuedInquiries = useOmnichannelInquiries();
	const showOmnichannelQueueLink = useSetting('Livechat_show_queue_list_link') as boolean && value.agentAvailable;

	const contextValue = useMemo(() => ({
		...value,
		queuedInquiries,
		showOmnichannelQueueLink,
	}), [value, queuedInquiries, showOmnichannelQueueLink]);

	return <OmnichannelContext.Provider value={contextValue} children={children}/>;
};

const OmnichannelEnabledProvider: FC = ({ children }) => {
	const [contextValue, setContextValue] = useState<OmnichannelContextValue>({
		...emptyContext,
		enabled: true,
	});

	const user = useUser() as OmnichannelAgent;
	const [routeConfig] = useMethodData<OmichannelRoutingConfig>('livechat:getRoutingConfig', args);

	const canViewOmnichannelQueue = usePermission('view-livechat-queue');

	useEffect(() => {
		setContextValue((context) => ({
			...context,
			agentAvailable: user?.statusLivechat === 'available',
		}));
	}, [user?.statusLivechat]);

	if (!routeConfig || !user) {
		return <OmnichannelDisabledProvider children={children}/>;
	}

	if (canViewOmnichannelQueue && routeConfig.showQueue && !routeConfig.autoAssignAgent && contextValue.agentAvailable) {
		return <OmnichannelManualSelectionProvider value={contextValue} children={children} />;
	}


	return <OmnichannelContext.Provider value={contextValue} children={children}/>;
};

const OmniChannelProvider: FC = React.memo(({ children }) => {
	const omniChannelEnabled = useSetting('Livechat_enabled') as boolean;
	const hasAccess = usePermission('view-l-room') as boolean;

	if (!omniChannelEnabled && !hasAccess) {
		return <OmnichannelDisabledProvider children={children}/>;
	}
	return <OmnichannelEnabledProvider children={children}/>;
});

export default OmniChannelProvider;
